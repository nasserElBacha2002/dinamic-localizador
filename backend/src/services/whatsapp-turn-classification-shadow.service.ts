import {
  SYSTEM_INTERACTION_CONSUME_RESULT_CODES,
  WHATSAPP_TURN_CLASSIFICATION_RULE_VERSION,
  WHATSAPP_TURN_SHADOW_BUDGET_MS,
} from "../constants/whatsapp-turn-classification";
import { env } from "../config/env";
import { whatsappTurnClassificationRepository } from "../repositories/whatsapp-turn-classification.repository";
import type { TurnClassificationInput } from "../types/whatsapp-turn-classification";
import { raceTimeout } from "../utils/race-timeout";
import { systemLogger } from "../utils/system-logs/logger";
import { whatsappTurnClassificationService } from "./whatsapp-turn-classification.service";
import { whatsappSystemInteractionService } from "./whatsapp-system-interaction.service";

const CONSUME_CODES = new Set<string>(SYSTEM_INTERACTION_CONSUME_RESULT_CODES);

/**
 * Phase 1 flag matrix (classification / system context):
 *
 * | ENABLED | SHADOW_ONLY | SYSTEM_CONTEXT | Effect |
 * |---------|-------------|----------------|--------|
 * | false   | *           | *              | Full off — no new reads/writes |
 * | true    | true        | true/false     | Shadow classify (+ context if SYSTEM_CONTEXT) |
 * | true    | false       | *              | Invalid in Phase 1 — env validation rejects |
 *
 * Full off does not alter existing bot_sessions or historical rows.
 */
export const whatsappTurnClassificationShadowService = {
  /** Complete kill switch for new classification + system-context I/O. */
  isFullyOff(): boolean {
    return env.WHATSAPP_TURN_CLASSIFICATION_ENABLED !== true;
  },

  isEnabled(): boolean {
    return env.WHATSAPP_TURN_CLASSIFICATION_ENABLED === true;
  },

  isSystemContextEnabled(): boolean {
    return this.isEnabled() && env.WHATSAPP_SYSTEM_CONTEXT_ENABLED === true;
  },

  /**
   * Classify + persist telemetry within a time budget. Never throws.
   * Lifecycle effects (consume) run only after a successful NEW insert and an
   * operational success resultCode — never from reasonCode alone / duplicate ignore.
   */
  async classifyAndRecord(input: TurnClassificationInput & {
    resultCode?: string | null;
  }): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    const work = this.classifyAndRecordInner(input);
    const raced = await raceTimeout(work, WHATSAPP_TURN_SHADOW_BUDGET_MS);
    if (raced.timedOut) {
      systemLogger.warn({
        module: "whatsapp-inbound",
        event: "whatsapp.turn.classification_budget_exceeded",
        message: "Shadow classification exceeded budget; webhook continues",
        metadata: {
          messageSid: input.messageSid,
          companyId: input.companyId,
          budgetMs: WHATSAPP_TURN_SHADOW_BUDGET_MS,
        },
      });
      // Let persistence finish in background without holding the response.
      void work.catch((error) => {
        systemLogger.warn({
          module: "whatsapp-inbound",
          event: "whatsapp.turn.classification_failed",
          message: "Background shadow classification failed",
          error,
          metadata: { messageSid: input.messageSid },
        });
      });
    }
  },

  async classifyAndRecordInner(input: TurnClassificationInput & {
    resultCode?: string | null;
  }): Promise<void> {
    try {
      const classified = whatsappTurnClassificationService.classify(input);
      const classifiedAt = new Date().toISOString();

      const { inserted } = await whatsappTurnClassificationRepository.insertIgnoreDuplicate({
        companyId: input.companyId,
        employeeId: input.employeeId,
        messageSid: input.messageSid,
        messageType: input.messageType,
        origin: classified.origin,
        classification: classified.classification,
        category: classified.category,
        reasonCode: classified.reasonCode,
        ruleVersion: classified.ruleVersion,
        activeSessionIntent: input.activeSessionIntent ?? null,
        activeSessionState: input.activeSessionState ?? null,
        resolvedIntent: input.resolvedIntent ?? null,
        resolvedHandler: input.resolvedHandler ?? null,
        relatedOperationId: classified.relatedOperationId ?? null,
        systemInteractionId: classified.systemInteractionId ?? null,
        causationMessageSid: null,
        classifiedAt,
      });

      // Duplicate classification must not re-fire lifecycle effects.
      if (!inserted) {
        return;
      }

      const resultCode = input.resultCode ?? null;
      if (
        inserted &&
        classified.systemInteractionId &&
        input.companyId &&
        resultCode &&
        CONSUME_CODES.has(resultCode)
      ) {
        await whatsappSystemInteractionService.markConsumedSafe({
          companyId: input.companyId,
          interactionId: classified.systemInteractionId,
        });
      }
    } catch (error) {
      systemLogger.warn({
        module: "whatsapp-inbound",
        event: "whatsapp.turn.classification_failed",
        message: "Shadow turn classification failed; continuing webhook",
        error,
        metadata: {
          messageSid: input.messageSid,
          companyId: input.companyId,
          employeeId: input.employeeId,
        },
      });
    }
  },

  /** Record SYSTEM_EXEMPT for job outbound templates (idempotent by provider SID). */
  async recordSystemOutboundExempt(input: {
    companyId: string;
    employeeId: string | null;
    providerMessageSid: string;
    category: string;
    relatedOperationId?: string | null;
    causationMessageSid?: string | null;
  }): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    try {
      await whatsappTurnClassificationRepository.insertIgnoreDuplicate({
        companyId: input.companyId,
        employeeId: input.employeeId,
        messageSid: input.providerMessageSid,
        messageType: "TEMPLATE",
        origin: "SYSTEM",
        classification: "SYSTEM_EXEMPT",
        category: input.category,
        reasonCode: "SYSTEM_OUTBOUND_TEMPLATE",
        ruleVersion: WHATSAPP_TURN_CLASSIFICATION_RULE_VERSION,
        activeSessionIntent: null,
        activeSessionState: null,
        resolvedIntent: null,
        resolvedHandler: input.category,
        relatedOperationId: input.relatedOperationId ?? null,
        systemInteractionId: null,
        causationMessageSid: input.causationMessageSid ?? null,
        classifiedAt: new Date().toISOString(),
      });
    } catch (error) {
      systemLogger.warn({
        module: "whatsapp-inbound",
        event: "whatsapp.turn.system_exempt_failed",
        message: "Failed to record SYSTEM_EXEMPT outbound (shadow)",
        error,
        metadata: {
          messageSid: input.providerMessageSid,
          companyId: input.companyId,
          employeeId: input.employeeId,
        },
      });
    }
  },

  /** Document outbound linked to a non-critical employee query turn. */
  async recordDocumentOutbound(input: {
    companyId: string;
    employeeId: string;
    providerMessageSid: string;
    causationMessageSid: string;
    category?: string;
  }): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    try {
      await whatsappTurnClassificationRepository.insertIgnoreDuplicate({
        companyId: input.companyId,
        employeeId: input.employeeId,
        messageSid: input.providerMessageSid,
        messageType: "DOCUMENT",
        origin: "SYSTEM",
        classification: "SYSTEM_EXEMPT",
        category: input.category ?? "PAYROLL_DOCUMENT",
        reasonCode: "SYSTEM_OUTBOUND_DOCUMENT",
        ruleVersion: WHATSAPP_TURN_CLASSIFICATION_RULE_VERSION,
        activeSessionIntent: null,
        activeSessionState: null,
        resolvedIntent: null,
        resolvedHandler: "PAYROLL_RECEIPT_QUERY",
        relatedOperationId: null,
        systemInteractionId: null,
        causationMessageSid: input.causationMessageSid,
        classifiedAt: new Date().toISOString(),
      });
    } catch (error) {
      systemLogger.warn({
        module: "whatsapp-inbound",
        event: "whatsapp.turn.document_exempt_failed",
        message: "Failed to record document SYSTEM_EXEMPT (shadow)",
        error,
        metadata: {
          messageSid: input.providerMessageSid,
          causationMessageSid: input.causationMessageSid,
        },
      });
    }
  },
};
