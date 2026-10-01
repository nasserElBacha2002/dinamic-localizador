import { env } from "../config/env";
import { whatsappLifecycleRepository } from "../repositories/whatsapp-lifecycle.repository";
import { withDedicatedSessionAppLock } from "../utils/whatsapp-retention-lock";

export const WHATSAPP_LIFECYCLE_LOCK_RESOURCE = "whatsapp-lifecycle-reconcile";

export type WhatsappLifecycleRunResult = {
  skipped?: boolean;
  lockSkipped?: boolean;
  dryRun: boolean;
  durationMs: number;
  conversationsCompleted: number;
  flowsFailed: number;
  webhooksFailed: number;
};

export type WhatsappLifecycleBodyInput = {
  dryRun: boolean;
  conversationIdleTimeoutHours: number;
  flowStartedTimeoutHours: number;
  batchSize: number;
  maxBatches: number;
};

export const runWhatsappLifecycleBody = async (
  input: WhatsappLifecycleBodyInput,
): Promise<Pick<WhatsappLifecycleRunResult, "conversationsCompleted" | "flowsFailed" | "webhooksFailed">> => {
  let conversationsCompleted = 0;
  let flowsFailed = 0;
  let webhooksFailed = 0;

  if (input.dryRun) {
    return { conversationsCompleted, flowsFailed, webhooksFailed };
  }

  for (let i = 0; i < input.maxBatches; i += 1) {
    const batch = await whatsappLifecycleRepository.completeIdleActiveConversations({
      idleTimeoutHours: input.conversationIdleTimeoutHours,
      batchSize: input.batchSize,
    });
    conversationsCompleted += batch.updated;
    if (batch.updated === 0) {
      break;
    }
  }

  for (let i = 0; i < input.maxBatches; i += 1) {
    const batch = await whatsappLifecycleRepository.failAbandonedStartedFlows({
      timeoutHours: input.flowStartedTimeoutHours,
      batchSize: input.batchSize,
    });
    flowsFailed += batch.updated;
    if (batch.updated === 0) {
      break;
    }
  }

  for (let i = 0; i < input.maxBatches; i += 1) {
    const batch = await whatsappLifecycleRepository.failAbandonedProcessingWebhooks({
      batchSize: input.batchSize,
    });
    webhooksFailed += batch.updated;
    if (batch.updated === 0) {
      break;
    }
  }

  return { conversationsCompleted, flowsFailed, webhooksFailed };
};

export const whatsappLifecycleService = {
  async runReconcile(input?: {
    dryRun?: boolean;
    conversationIdleTimeoutHours?: number;
    flowStartedTimeoutHours?: number;
    batchSize?: number;
    maxBatches?: number;
  }): Promise<WhatsappLifecycleRunResult> {
    const started = Date.now();
    const dryRun = input?.dryRun ?? env.WHATSAPP_LIFECYCLE_DRY_RUN;
    const conversationIdleTimeoutHours =
      input?.conversationIdleTimeoutHours ?? env.WHATSAPP_CONVERSATION_IDLE_TIMEOUT_HOURS;
    const flowStartedTimeoutHours =
      input?.flowStartedTimeoutHours ?? env.WHATSAPP_FLOW_STARTED_TIMEOUT_HOURS;
    const batchSize = input?.batchSize ?? env.WHATSAPP_LIFECYCLE_BATCH_SIZE;
    const maxBatches = input?.maxBatches ?? env.WHATSAPP_LIFECYCLE_MAX_BATCHES;

    if (!env.WHATSAPP_LIFECYCLE_JOB_ENABLED) {
      return {
        skipped: true,
        dryRun,
        durationMs: Date.now() - started,
        conversationsCompleted: 0,
        flowsFailed: 0,
        webhooksFailed: 0,
      };
    }

    const lockResult = await withDedicatedSessionAppLock(WHATSAPP_LIFECYCLE_LOCK_RESOURCE, async () =>
      runWhatsappLifecycleBody({
        dryRun,
        conversationIdleTimeoutHours,
        flowStartedTimeoutHours,
        batchSize,
        maxBatches,
      }),
    );

    if (lockResult.outcome === "skipped") {
      return {
        lockSkipped: true,
        dryRun,
        durationMs: Date.now() - started,
        conversationsCompleted: 0,
        flowsFailed: 0,
        webhooksFailed: 0,
      };
    }

    const result: WhatsappLifecycleRunResult = {
      dryRun,
      durationMs: Date.now() - started,
      ...lockResult.value,
    };

    console.info("[whatsapp-lifecycle] reconcile complete", {
      dryRun: result.dryRun,
      durationMs: result.durationMs,
      conversationsCompleted: result.conversationsCompleted,
      flowsFailed: result.flowsFailed,
      webhooksFailed: result.webhooksFailed,
      conversationIdleTimeoutHours,
      flowStartedTimeoutHours,
    });

    return result;
  },
};
