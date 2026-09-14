import { env } from "../config/env";
import {
  ATTENDANCE_REMINDER_LEAD_MINUTES,
  NO_CHECKIN_AT_START_WINDOW_MINUTES,
} from "../constants/attendance-notification";
import type { WhatsAppSystemInteractionCategory } from "../constants/whatsapp-turn-classification";
import {
  WHATSAPP_SYSTEM_INTERACTION_TERMINAL_STATUSES,
} from "../constants/whatsapp-turn-classification";
import { whatsappSystemInteractionRepository } from "../repositories/whatsapp-system-interaction.repository";
import type { SystemInteractionContext } from "../types/whatsapp-turn-classification";
import { isAttendanceConfirmationWindowOpen } from "../utils/attendance-confirmation-validity";
import { systemLogger } from "../utils/system-logs/logger";
import { systemInteractionMatchesCriticalReply } from "./whatsapp-turn-classification.service";
import type { TurnClassificationInput } from "../types/whatsapp-turn-classification";

const categoryForAttendanceNotification = (
  notificationType: string,
): WhatsAppSystemInteractionCategory | null => {
  switch (notificationType) {
    case "ARRIVAL_REMINDER_15_MIN":
      return "ARRIVAL_REMINDER";
    case "EXIT_REMINDER_15_MIN":
      return "EXIT_REMINDER";
    case "NO_CHECKIN_AT_START":
      return "NO_CHECKIN_REMINDER";
    case "ATTENDANCE_CONFIRMATION_REMINDER":
      return "ATTENDANCE_CONFIRMATION";
    default:
      return null;
  }
};

const isTerminalStatus = (status: string): boolean =>
  (WHATSAPP_SYSTEM_INTERACTION_TERMINAL_STATUSES as readonly string[]).includes(status);

/**
 * Derive expires_at from existing operational windows (not a universal 2h TTL).
 * - Confirmation / assignment: until scheduledStart (exclusive end of reply window)
 * - Arrival/exit reminders: lead window + bot session TTL (time to act after prompt)
 * - No-checkin: short start window + bot session TTL
 */
export const computeSystemInteractionExpiresAt = (input: {
  category: WhatsAppSystemInteractionCategory;
  now: Date;
  scheduledStart?: Date | string | null;
}): Date => {
  const sessionTtlMs = env.BOT_SESSION_TTL_MINUTES * 60_000;

  if (
    input.category === "ATTENDANCE_CONFIRMATION" ||
    input.category === "OPERATION_ASSIGNMENT"
  ) {
    if (input.scheduledStart) {
      const start = new Date(input.scheduledStart);
      if (Number.isFinite(start.getTime()) && start.getTime() > input.now.getTime()) {
        return start;
      }
    }
    // Fallback when scheduledStart missing: session TTL only (still not a fixed 2h).
    return new Date(input.now.getTime() + sessionTtlMs);
  }

  if (input.category === "NO_CHECKIN_REMINDER") {
    return new Date(
      input.now.getTime() + NO_CHECKIN_AT_START_WINDOW_MINUTES * 60_000 + sessionTtlMs,
    );
  }

  // Arrival / exit reminders
  return new Date(
    input.now.getTime() + ATTENDANCE_REMINDER_LEAD_MINUTES * 60_000 + sessionTtlMs,
  );
};

/**
 * Durable SYSTEM-initiated interaction context (Phase 1).
 *
 * Transactional boundary (documented, not promised atomic with Twilio):
 * 1. prepare() → SQL PREPARED (idempotent by source_key) BEFORE Twilio send
 * 2. Twilio accept / fail / ambiguous
 * 3. markSendAccepted | markSendFailed | markSendAmbiguous
 * A Twilio accept followed by SQL failure on markSendAccepted must NOT trigger a new send;
 * reconciliation repairs context (ACTIVE) without re-sending.
 */
export const whatsappSystemInteractionService = {
  isEnabled(): boolean {
    return (
      env.WHATSAPP_SYSTEM_CONTEXT_ENABLED === true &&
      env.WHATSAPP_TURN_CLASSIFICATION_ENABLED === true
    );
  },

  /**
   * Prepare durable context before Twilio. Does not mark ACTIVE.
   * Does not reactivate CONSUMED / CANCELLED / EXPIRED.
   * Re-arms SEND_FAILED for intentional outbox retries without renewing expires_at.
   */
  async prepareAttendanceReminderContext(input: {
    companyId: string;
    employeeId: string;
    operationId: string;
    notificationId: string;
    notificationType: string;
    scheduledStart?: Date | string | null;
    now?: Date;
  }): Promise<SystemInteractionContext | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const category = categoryForAttendanceNotification(input.notificationType);
    if (!category) {
      return null;
    }
    const now = input.now ?? new Date();
    const sourceKey = `attendance_notification:${input.notificationId}`;
    try {
      const existing = await whatsappSystemInteractionRepository.findBySourceKey({
        companyId: input.companyId,
        sourceKey,
      });
      if (existing) {
        if (existing.status === "SEND_FAILED") {
          return (
            (await whatsappSystemInteractionRepository.rearmSendFailed({
              companyId: input.companyId,
              sourceKey,
            })) ?? existing
          );
        }
        return existing;
      }

      if (
        category === "ATTENDANCE_CONFIRMATION" &&
        input.scheduledStart &&
        !isAttendanceConfirmationWindowOpen(input.scheduledStart, now)
      ) {
        return null;
      }

      const expiresAt = computeSystemInteractionExpiresAt({
        category,
        now,
        scheduledStart: input.scheduledStart,
      });

      return await whatsappSystemInteractionRepository.prepare({
        companyId: input.companyId,
        employeeId: input.employeeId,
        category,
        relatedOperationId: input.operationId,
        sourceJob: "attendance-reminder",
        sourceKey,
        sourceMessageId: input.notificationId,
        expiresAt,
      });
    } catch (error) {
      systemLogger.warn({
        module: "whatsapp-inbound",
        event: "whatsapp.system_interaction.prepare_failed",
        message: "Failed to prepare attendance system interaction (shadow)",
        error,
        metadata: {
          category,
          sourceKey,
          companyId: input.companyId,
          employeeId: input.employeeId,
        },
      });
      return null;
    }
  },

  async prepareOperationAssignmentContext(input: {
    companyId: string;
    employeeId: string;
    operationId: string;
    notificationId: string;
    scheduledStart?: Date | string | null;
    now?: Date;
  }): Promise<SystemInteractionContext | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const sourceKey = `operation_assignment_notification:${input.notificationId}`;
    const now = input.now ?? new Date();
    try {
      const existing = await whatsappSystemInteractionRepository.findBySourceKey({
        companyId: input.companyId,
        sourceKey,
      });
      if (existing) {
        if (existing.status === "SEND_FAILED") {
          return (
            (await whatsappSystemInteractionRepository.rearmSendFailed({
              companyId: input.companyId,
              sourceKey,
            })) ?? existing
          );
        }
        return existing;
      }

      const expiresAt = computeSystemInteractionExpiresAt({
        category: "OPERATION_ASSIGNMENT",
        now,
        scheduledStart: input.scheduledStart,
      });

      return await whatsappSystemInteractionRepository.prepare({
        companyId: input.companyId,
        employeeId: input.employeeId,
        category: "OPERATION_ASSIGNMENT",
        relatedOperationId: input.operationId,
        sourceJob: "operation-assignment-notification",
        sourceKey,
        sourceMessageId: input.notificationId,
        expiresAt,
      });
    } catch (error) {
      systemLogger.warn({
        module: "whatsapp-inbound",
        event: "whatsapp.system_interaction.prepare_failed",
        message: "Failed to prepare assignment system interaction (shadow)",
        error,
        metadata: {
          sourceKey,
          companyId: input.companyId,
          employeeId: input.employeeId,
        },
      });
      return null;
    }
  },

  async markSendAcceptedSafe(input: {
    companyId: string;
    sourceKey: string;
    providerMessageSid: string;
  }): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    try {
      await whatsappSystemInteractionRepository.markSendAccepted(input);
    } catch (error) {
      systemLogger.warn({
        module: "whatsapp-inbound",
        event: "whatsapp.system_interaction.accept_failed",
        message:
          "Twilio accepted but SQL markSendAccepted failed; do not re-send — reconcile context",
        error,
        metadata: {
          sourceKey: input.sourceKey,
          companyId: input.companyId,
        },
      });
    }
  },

  async markSendFailedSafe(input: { companyId: string; sourceKey: string }): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    try {
      await whatsappSystemInteractionRepository.markSendFailed(input);
    } catch (error) {
      systemLogger.warn({
        module: "whatsapp-inbound",
        event: "whatsapp.system_interaction.fail_mark_failed",
        message: "Failed to mark system interaction SEND_FAILED (shadow)",
        error,
        metadata: { sourceKey: input.sourceKey, companyId: input.companyId },
      });
    }
  },

  async markSendAmbiguousSafe(input: {
    companyId: string;
    sourceKey: string;
    providerMessageSid?: string | null;
  }): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    try {
      await whatsappSystemInteractionRepository.markSendAmbiguous(input);
    } catch (error) {
      systemLogger.warn({
        module: "whatsapp-inbound",
        event: "whatsapp.system_interaction.ambiguous_mark_failed",
        message: "Failed to mark system interaction SEND_AMBIGUOUS (shadow)",
        error,
        metadata: { sourceKey: input.sourceKey, companyId: input.companyId },
      });
    }
  },

  /**
   * Fail-open correlate: never throws. Returns null on error/timeout/ambiguity.
   * Does not invent links across company/employee/operation without evidence.
   */
  async correlateForTurnSafe(input: {
    companyId: string;
    employeeId: string;
    relatedOperationId?: string | null;
    turn: Pick<
      TurnClassificationInput,
      "resolvedIntent" | "resolvedHandler" | "messageType"
    >;
    now?: Date;
  }): Promise<SystemInteractionContext | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const now = input.now ?? new Date();
    try {
      await whatsappSystemInteractionRepository.markExpiredDue({
        companyId: input.companyId,
        employeeId: input.employeeId,
        now,
      });

      const candidates = await whatsappSystemInteractionRepository.findActiveCandidates({
        companyId: input.companyId,
        employeeId: input.employeeId,
        relatedOperationId: input.relatedOperationId ?? null,
        now,
      });

      const matching = candidates.filter((candidate) =>
        systemInteractionMatchesCriticalReply(candidate, {
          companyId: input.companyId,
          employeeId: input.employeeId,
          messageSid: "",
          messageType: input.turn.messageType,
          resolvedIntent: input.turn.resolvedIntent,
          resolvedHandler: input.turn.resolvedHandler,
          relatedOperationId: input.relatedOperationId,
        }),
      );

      if (matching.length !== 1) {
        return null;
      }
      return matching[0] ?? null;
    } catch (error) {
      systemLogger.warn({
        module: "whatsapp-inbound",
        event: "whatsapp.system_interaction.correlate_failed",
        message: "System interaction correlate failed (shadow fail-open)",
        error,
        metadata: {
          companyId: input.companyId,
          employeeId: input.employeeId,
        },
      });
      return null;
    }
  },

  /** True when prepare returned a state that must not trigger Twilio send. */
  shouldSkipSend(context: SystemInteractionContext | null): boolean {
    if (!context) {
      return false;
    }
    if (context.status === "ACTIVE" && context.providerMessageSid) {
      return true;
    }
    if (context.status === "SEND_AMBIGUOUS") {
      return true;
    }
    if (isTerminalStatus(context.status) && context.status !== "SEND_FAILED") {
      return true;
    }
    return false;
  },

  async markConsumedSafe(input: {
    companyId: string;
    interactionId: string;
  }): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    try {
      await whatsappSystemInteractionRepository.markConsumed(input);
    } catch (error) {
      systemLogger.warn({
        module: "whatsapp-inbound",
        event: "whatsapp.system_interaction.consume_failed",
        message: "Failed to mark system interaction consumed (shadow)",
        error,
        metadata: {
          interactionId: input.interactionId,
          companyId: input.companyId,
        },
      });
    }
  },

  sourceKeyForAttendanceNotification(notificationId: string): string {
    return `attendance_notification:${notificationId}`;
  },

  sourceKeyForOperationAssignment(notificationId: string): string {
    return `operation_assignment_notification:${notificationId}`;
  },
};
