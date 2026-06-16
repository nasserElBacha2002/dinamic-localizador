import sql from "mssql";
import { env } from "../config/env";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { botSessionRepository } from "../repositories/bot-session.repository";
import type { BotSession, BotSessionContext, InventorySelectionOption } from "../types/twilio.types";
import {
  buildSessionExpiresAt,
  isSessionActive,
  isSessionExpiredByTime,
} from "../utils/bot-session-expiration";

export type SessionSelectionResult =
  | { kind: "ok"; session: BotSession }
  | { kind: "expired" }
  | { kind: "invalid" };

const buildExpiresAt = (): Date => buildSessionExpiresAt(env.BOT_SESSION_TTL_MINUTES);

const parseContext = (contextJson: string | null): BotSessionContext => {
  if (!contextJson) {
    return {};
  }

  try {
    return JSON.parse(contextJson) as BotSessionContext;
  } catch {
    return {};
  }
};

const runInTransaction = async <T>(operation: (transaction: sql.Transaction) => Promise<T>): Promise<T> => {
  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const result = await operation(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const prepareForNewSession = async (
  employeeId: string,
  phoneNumber: string,
  transaction: sql.Transaction,
): Promise<void> => {
  const expiredCount = await botSessionRepository.expireStaleSessionsForParticipant(
    employeeId,
    phoneNumber,
    transaction,
  );
  const cancelledCount = await botSessionRepository.cancelValidActiveSessions(
    employeeId,
    phoneNumber,
    transaction,
  );

  if (expiredCount > 0) {
    console.info("[bot-session] stale sessions expired before new flow", {
      employeeId,
      phoneNumber,
      expiredCount,
    });
  }

  if (cancelledCount > 0) {
    console.info("[bot-session] active sessions cancelled before new flow", {
      employeeId,
      phoneNumber,
      cancelledCount,
    });
  }
};

export const botSessionService = {
  parseContext,
  buildExpiresAt,

  async getActiveSessionByPhone(phoneNumber: string): Promise<BotSession | null> {
    return runInTransaction(async (transaction) => {
      const valid = await botSessionRepository.findValidActiveByPhone(phoneNumber, transaction);
      if (valid) {
        return valid;
      }

      const stale = await botSessionRepository.findStaleActiveByPhone(phoneNumber, transaction);
      if (!stale) {
        return null;
      }

      const expired = await botSessionRepository.expireSessionById(stale.id, transaction);
      if (expired) {
        console.info("[bot-session] session expired lazily", {
          sessionId: stale.id,
          phoneNumber,
        });
      }

      return null;
    });
  },

  async getLatestSessionByPhone(phoneNumber: string): Promise<BotSession | null> {
    return botSessionRepository.findLatestByPhone(phoneNumber);
  },

  async getSessionResolutionByPhone(phoneNumber: string): Promise<{
    activeSession: BotSession | null;
    recentlyExpired: boolean;
  }> {
    const activeSession = await this.getActiveSessionByPhone(phoneNumber);
    if (activeSession) {
      return { activeSession, recentlyExpired: false };
    }

    const latest = await botSessionRepository.findLatestByPhone(phoneNumber);
    return {
      activeSession: null,
      recentlyExpired: latest?.state === "EXPIRED",
    };
  },

  async expireSession(sessionId: string): Promise<boolean> {
    const expired = await botSessionRepository.expireSessionById(sessionId);
    if (expired) {
      console.info("[bot-session] session expired explicitly", { sessionId });
    }
    return expired;
  },

  async createWaitingLocationSession(input: {
    employeeId: string;
    phoneNumber: string;
    inventoryId: string;
  }): Promise<BotSession> {
    try {
      const session = await runInTransaction(async (transaction) => {
        await prepareForNewSession(input.employeeId, input.phoneNumber, transaction);
        return botSessionRepository.create(
          {
            employeeId: input.employeeId,
            inventoryId: input.inventoryId,
            phoneNumber: input.phoneNumber,
            state: "WAITING_LOCATION",
            contextJson: null,
            expiresAt: buildExpiresAt(),
          },
          transaction,
        );
      });

      console.info("[bot-session] waiting location session created", {
        sessionId: session.id,
        employeeId: input.employeeId,
        inventoryId: input.inventoryId,
        expiresAt: session.expiresAt,
      });

      return session;
    } catch (error) {
      if (botSessionRepository.isUniqueConstraintError(error)) {
        console.warn("[bot-session] active session conflict while creating waiting location", {
          employeeId: input.employeeId,
          phoneNumber: input.phoneNumber,
        });
        throw new AppError(
          409,
          "BOT_ACTIVE_SESSION_CONFLICT",
          "Ya existe una sesión activa para este empleado",
        );
      }

      throw error;
    }
  },

  async createInventorySelectionSession(input: {
    employeeId: string;
    phoneNumber: string;
    options: InventorySelectionOption[];
  }): Promise<BotSession> {
    try {
      const session = await runInTransaction(async (transaction) => {
        await prepareForNewSession(input.employeeId, input.phoneNumber, transaction);
        return botSessionRepository.create(
          {
            employeeId: input.employeeId,
            inventoryId: null,
            phoneNumber: input.phoneNumber,
            state: "WAITING_INVENTORY_SELECTION",
            contextJson: JSON.stringify({ inventoryOptions: input.options }),
            expiresAt: buildExpiresAt(),
          },
          transaction,
        );
      });

      console.info("[bot-session] inventory selection session created", {
        sessionId: session.id,
        employeeId: input.employeeId,
        options: input.options.length,
        expiresAt: session.expiresAt,
      });

      return session;
    } catch (error) {
      if (botSessionRepository.isUniqueConstraintError(error)) {
        console.warn("[bot-session] active session conflict while creating selection session", {
          employeeId: input.employeeId,
          phoneNumber: input.phoneNumber,
        });
        throw new AppError(
          409,
          "BOT_ACTIVE_SESSION_CONFLICT",
          "Ya existe una sesión activa para este empleado",
        );
      }

      throw error;
    }
  },

  async selectInventoryAndRenewExpiration(
    sessionId: string,
    inventoryId: string,
  ): Promise<SessionSelectionResult> {
    return runInTransaction(async (transaction) => {
      const valid = await botSessionRepository.findValidActiveById(sessionId, transaction);
      if (!valid) {
        const stale = await botSessionRepository.findStaleActiveById(sessionId, transaction);
        if (stale) {
          await botSessionRepository.expireSessionById(stale.id, transaction);
          console.info("[bot-session] selection attempted on expired session", {
            sessionId: stale.id,
          });
        }
        return { kind: "expired" };
      }

      if (valid.state !== "WAITING_INVENTORY_SELECTION") {
        return { kind: "invalid" };
      }

      const renewedExpiresAt = buildExpiresAt();
      const updated = await botSessionRepository.updateSession(
        sessionId,
        {
          inventoryId,
          state: "WAITING_LOCATION",
          contextJson: null,
          expiresAt: renewedExpiresAt,
        },
        transaction,
      );

      if (!updated) {
        return { kind: "invalid" };
      }

      console.info("[bot-session] session renewed after inventory selection", {
        sessionId: updated.id,
        inventoryId,
        expiresAt: updated.expiresAt,
      });

      return { kind: "ok", session: updated };
    });
  },

  async completeSession(sessionId: string, transaction?: sql.Transaction): Promise<void> {
    await botSessionRepository.updateSession(sessionId, { state: "COMPLETED" }, transaction);
    console.info("[bot-session] session completed", { sessionId });
  },

  async cancelSession(sessionId: string): Promise<void> {
    await botSessionRepository.updateSession(sessionId, { state: "CANCELLED" });
    console.info("[bot-session] session cancelled", { sessionId });
  },

  isActive(session: BotSession, now = new Date()): boolean {
    return isSessionActive(session, now);
  },

  isExpired(session: BotSession, now = new Date()): boolean {
    return isSessionExpiredByTime(session, now);
  },
};
