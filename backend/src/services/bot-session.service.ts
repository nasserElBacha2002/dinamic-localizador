import sql from "mssql";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { botSessionRepository } from "../repositories/bot-session.repository";
import type { BotSession, BotSessionContext, OperationSelectionOption } from "../types/twilio.types";
import {
  buildSessionExpiresAt,
  isSessionActive,
  isSessionExpiredByTime,
} from "../utils/bot-session-expiration";
import { getSessionTtlMinutes } from "../utils/bot-runtime-settings-scope";

export type SessionSelectionResult =
  | { kind: "ok"; session: BotSession }
  | { kind: "expired" }
  | { kind: "invalid" };

const buildExpiresAt = (): Date => buildSessionExpiresAt(getSessionTtlMinutes());

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
  companyId: string,
  employeeId: string,
  phoneNumber: string,
  transaction: sql.Transaction,
): Promise<void> => {
  const expiredCount = await botSessionRepository.expireStaleSessionsForParticipant(
    companyId,
    employeeId,
    phoneNumber,
    transaction,
  );
  const cancelledCount = await botSessionRepository.cancelValidActiveSessions(
    companyId,
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

  async getActiveSessionByPhone(companyId: string, phoneNumber: string): Promise<BotSession | null> {
    return runInTransaction(async (transaction) => {
      const valid = await botSessionRepository.findValidActiveByPhone(companyId, phoneNumber, transaction);
      if (valid) {
        return valid;
      }

      const stale = await botSessionRepository.findStaleActiveByPhone(companyId, phoneNumber, transaction);
      if (!stale) {
        return null;
      }

      const expired = await botSessionRepository.expireSessionById(companyId, stale.id, transaction);
      if (expired) {
        console.info("[bot-session] session expired lazily", {
          sessionId: stale.id,
          phoneNumber,
        });
      }

      return null;
    });
  },

  async getLatestSessionByPhone(companyId: string, phoneNumber: string): Promise<BotSession | null> {
    return botSessionRepository.findLatestByPhone(companyId, phoneNumber);
  },

  async getSessionResolutionByPhone(companyId: string, phoneNumber: string): Promise<{
    activeSession: BotSession | null;
    recentlyExpired: boolean;
  }> {
    const activeSession = await this.getActiveSessionByPhone(companyId, phoneNumber);
    if (activeSession) {
      return { activeSession, recentlyExpired: false };
    }

    const latest = await botSessionRepository.findLatestByPhone(companyId, phoneNumber);
    return {
      activeSession: null,
      recentlyExpired: latest?.state === "EXPIRED",
    };
  },

  async expireSession(companyId: string, sessionId: string): Promise<boolean> {
    const expired = await botSessionRepository.expireSessionById(companyId, sessionId);
    if (expired) {
      console.info("[bot-session] session expired explicitly", { sessionId });
    }
    return expired;
  },

  async createWaitingLocationSession(
    companyId: string,
    input: {
    employeeId: string;
    phoneNumber: string;
    operationId: string;
  }): Promise<BotSession> {
    try {
      const session = await runInTransaction(async (transaction) => {
        await prepareForNewSession(companyId, input.employeeId, input.phoneNumber, transaction);
        return botSessionRepository.create(
          {
            companyId,
            employeeId: input.employeeId,
            operationId: input.operationId,
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
        operationId: input.operationId,
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

  async createOperationSelectionSession(
    companyId: string,
    input: {
    employeeId: string;
    phoneNumber: string;
    options: OperationSelectionOption[];
  }): Promise<BotSession> {
    try {
      const session = await runInTransaction(async (transaction) => {
        await prepareForNewSession(companyId, input.employeeId, input.phoneNumber, transaction);
        return botSessionRepository.create(
          {
            companyId,
            employeeId: input.employeeId,
            operationId: null,
            phoneNumber: input.phoneNumber,
            state: "WAITING_OPERATION_SELECTION",
            contextJson: JSON.stringify({ operationOptions: input.options }),
            expiresAt: buildExpiresAt(),
          },
          transaction,
        );
      });

      console.info("[bot-session] operation selection session created", {
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

  async selectOperationAndRenewExpiration(
    companyId: string,
    sessionId: string,
    operationId: string,
  ): Promise<SessionSelectionResult> {
    return runInTransaction(async (transaction) => {
      const valid = await botSessionRepository.findValidActiveById(companyId, sessionId, transaction);
      if (!valid) {
        const stale = await botSessionRepository.findStaleActiveById(companyId, sessionId, transaction);
        if (stale) {
          await botSessionRepository.expireSessionById(companyId, stale.id, transaction);
          console.info("[bot-session] selection attempted on expired session", {
            sessionId: stale.id,
          });
        }
        return { kind: "expired" };
      }

      if (valid.state !== "WAITING_OPERATION_SELECTION") {
        return { kind: "invalid" };
      }

      const renewedExpiresAt = buildExpiresAt();
      const updated = await botSessionRepository.updateSession(
        companyId,
        sessionId,
        {
          operationId,
          state: "WAITING_LOCATION",
          contextJson: null,
          expiresAt: renewedExpiresAt,
        },
        transaction,
      );

      if (!updated) {
        return { kind: "invalid" };
      }

      console.info("[bot-session] session renewed after operation selection", {
        sessionId: updated.id,
        operationId,
        expiresAt: updated.expiresAt,
      });

      return { kind: "ok", session: updated };
    });
  },

  async createWaitingCheckoutLocationSession(
    companyId: string,
    input: {
    employeeId: string;
    phoneNumber: string;
    operationId: string;
  }): Promise<BotSession> {
    try {
      const session = await runInTransaction(async (transaction) => {
        await prepareForNewSession(companyId, input.employeeId, input.phoneNumber, transaction);
        return botSessionRepository.create(
          {
            companyId,
            employeeId: input.employeeId,
            operationId: input.operationId,
            phoneNumber: input.phoneNumber,
            state: "WAITING_CHECKOUT_LOCATION",
            contextJson: null,
            expiresAt: buildExpiresAt(),
          },
          transaction,
        );
      });

      console.info("[bot-session] waiting checkout location session created", {
        sessionId: session.id,
        employeeId: input.employeeId,
        operationId: input.operationId,
        expiresAt: session.expiresAt,
      });

      return session;
    } catch (error) {
      if (botSessionRepository.isUniqueConstraintError(error)) {
        throw new AppError(
          409,
          "BOT_ACTIVE_SESSION_CONFLICT",
          "Ya existe una sesión activa para este empleado",
        );
      }

      throw error;
    }
  },

  async createCheckoutOperationSelectionSession(
    companyId: string,
    input: {
    employeeId: string;
    phoneNumber: string;
    options: OperationSelectionOption[];
  }): Promise<BotSession> {
    try {
      const session = await runInTransaction(async (transaction) => {
        await prepareForNewSession(companyId, input.employeeId, input.phoneNumber, transaction);
        return botSessionRepository.create(
          {
            companyId,
            employeeId: input.employeeId,
            operationId: null,
            phoneNumber: input.phoneNumber,
            state: "WAITING_CHECKOUT_OPERATION_SELECTION",
            contextJson: JSON.stringify({ operationOptions: input.options }),
            expiresAt: buildExpiresAt(),
          },
          transaction,
        );
      });

      console.info("[bot-session] checkout operation selection session created", {
        sessionId: session.id,
        employeeId: input.employeeId,
        options: input.options.length,
        expiresAt: session.expiresAt,
      });

      return session;
    } catch (error) {
      if (botSessionRepository.isUniqueConstraintError(error)) {
        throw new AppError(
          409,
          "BOT_ACTIVE_SESSION_CONFLICT",
          "Ya existe una sesión activa para este empleado",
        );
      }

      throw error;
    }
  },

  async selectCheckoutOperationAndRenewExpiration(
    companyId: string,
    sessionId: string,
    operationId: string,
  ): Promise<SessionSelectionResult> {
    return runInTransaction(async (transaction) => {
      const valid = await botSessionRepository.findValidActiveById(companyId, sessionId, transaction);
      if (!valid) {
        const stale = await botSessionRepository.findStaleActiveById(companyId, sessionId, transaction);
        if (stale) {
          await botSessionRepository.expireSessionById(companyId, stale.id, transaction);
        }
        return { kind: "expired" };
      }

      if (valid.state !== "WAITING_CHECKOUT_OPERATION_SELECTION") {
        return { kind: "invalid" };
      }

      const renewedExpiresAt = buildExpiresAt();
      const updated = await botSessionRepository.updateSession(
        companyId,
        sessionId,
        {
          operationId,
          state: "WAITING_CHECKOUT_LOCATION",
          contextJson: null,
          expiresAt: renewedExpiresAt,
        },
        transaction,
      );

      if (!updated) {
        return { kind: "invalid" };
      }

      return { kind: "ok", session: updated };
    });
  },

  async createConfirmAttendanceSelectionSession(
    companyId: string,
    input: {
      employeeId: string;
      phoneNumber: string;
      options: OperationSelectionOption[];
    },
  ): Promise<BotSession> {
    try {
      const session = await runInTransaction(async (transaction) => {
        await prepareForNewSession(companyId, input.employeeId, input.phoneNumber, transaction);
        return botSessionRepository.create(
          {
            companyId,
            employeeId: input.employeeId,
            operationId: null,
            phoneNumber: input.phoneNumber,
            state: "WAITING_CONFIRM_ATTENDANCE_SELECTION",
            contextJson: JSON.stringify({ operationOptions: input.options }),
            expiresAt: buildExpiresAt(),
          },
          transaction,
        );
      });

      console.info("[bot-session] confirm attendance selection session created", {
        sessionId: session.id,
        employeeId: input.employeeId,
        options: input.options.length,
        expiresAt: session.expiresAt,
      });

      return session;
    } catch (error) {
      if (botSessionRepository.isUniqueConstraintError(error)) {
        throw new AppError(
          409,
          "BOT_ACTIVE_SESSION_CONFLICT",
          "Ya existe una sesión activa para este empleado",
        );
      }

      throw error;
    }
  },

  async createUnavailabilitySelectionSession(
    companyId: string,
    input: {
      employeeId: string;
      phoneNumber: string;
      options: OperationSelectionOption[];
    },
  ): Promise<BotSession> {
    try {
      const session = await runInTransaction(async (transaction) => {
        await prepareForNewSession(companyId, input.employeeId, input.phoneNumber, transaction);
        return botSessionRepository.create(
          {
            companyId,
            employeeId: input.employeeId,
            operationId: null,
            phoneNumber: input.phoneNumber,
            state: "WAITING_UNAVAILABILITY_SELECTION",
            contextJson: JSON.stringify({ operationOptions: input.options }),
            expiresAt: buildExpiresAt(),
          },
          transaction,
        );
      });

      console.info("[bot-session] unavailability selection session created", {
        sessionId: session.id,
        employeeId: input.employeeId,
        options: input.options.length,
        expiresAt: session.expiresAt,
      });

      return session;
    } catch (error) {
      if (botSessionRepository.isUniqueConstraintError(error)) {
        throw new AppError(
          409,
          "BOT_ACTIVE_SESSION_CONFLICT",
          "Ya existe una sesión activa para este empleado",
        );
      }

      throw error;
    }
  },

  async createAttendanceConfirmationResponseSession(
    companyId: string,
    input: {
      employeeId: string;
      phoneNumber: string;
      operationId: string;
      notificationId: string;
      scheduleVersion: number;
    },
  ): Promise<BotSession | null> {
    try {
      const session = await runInTransaction(async (transaction) => {
        await prepareForNewSession(companyId, input.employeeId, input.phoneNumber, transaction);
        return botSessionRepository.create(
          {
            companyId,
            employeeId: input.employeeId,
            operationId: input.operationId,
            phoneNumber: input.phoneNumber,
            state: "WAITING_ATTENDANCE_CONFIRMATION_RESPONSE",
            contextJson: JSON.stringify({
              attendanceConfirmation: {
                operationId: input.operationId,
                notificationId: input.notificationId,
                scheduleVersion: input.scheduleVersion,
              },
            }),
            expiresAt: buildExpiresAt(),
          },
          transaction,
        );
      });

      console.info("[bot-session] attendance confirmation response session created", {
        sessionId: session.id,
        employeeId: input.employeeId,
        operationId: input.operationId,
        scheduleVersion: input.scheduleVersion,
      });

      return session;
    } catch (error) {
      if (botSessionRepository.isUniqueConstraintError(error)) {
        console.info("[bot-session] skipped confirmation response session because active session exists", {
          employeeId: input.employeeId,
          operationId: input.operationId,
        });
        return null;
      }

      throw error;
    }
  },

  async completeSession(companyId: string, sessionId: string, transaction?: sql.Transaction): Promise<void> {
    await botSessionRepository.updateSession(companyId, sessionId, { state: "COMPLETED" }, transaction);
    console.info("[bot-session] session completed", { sessionId });
  },

  async cancelSession(companyId: string, sessionId: string): Promise<void> {
    await botSessionRepository.updateSession(companyId, sessionId, { state: "CANCELLED" });
    console.info("[bot-session] session cancelled", { sessionId });
  },

  async createAbsenceSession(
    companyId: string,
    input: {
    employeeId: string;
    phoneNumber: string;
    state: import("../types/twilio.types").BotSessionState;
    contextJson: string;
  }): Promise<BotSession> {
    const session = await runInTransaction(async (transaction) => {
      await prepareForNewSession(companyId, input.employeeId, input.phoneNumber, transaction);
      return botSessionRepository.create(
        {
          companyId,
          employeeId: input.employeeId,
          operationId: null,
          phoneNumber: input.phoneNumber,
          state: input.state,
          contextJson: input.contextJson,
          expiresAt: buildExpiresAt(),
        },
        transaction,
      );
    });

    console.info("[bot-session] absence session created", {
      sessionId: session.id,
      employeeId: input.employeeId,
      state: input.state,
    });

    return session;
  },

  async updateAbsenceSession(
    companyId: string,
    sessionId: string,
    input: {
      state: import("../types/twilio.types").BotSessionState;
      contextJson: string;
    },
  ): Promise<BotSession | null> {
    return botSessionRepository.updateSession(companyId, sessionId, {
      state: input.state,
      contextJson: input.contextJson,
      expiresAt: buildExpiresAt(),
    });
  },

  isActive(session: BotSession, now = new Date()): boolean {
    return isSessionActive(session, now);
  },

  isExpired(session: BotSession, now = new Date()): boolean {
    return isSessionExpiredByTime(session, now);
  },
};
