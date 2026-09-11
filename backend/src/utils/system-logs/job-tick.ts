import type { SystemLogEvent, SystemLogModule } from "../../constants/system-logs";
import { systemLogger } from "./logger";
import {
  beginJobLogContext,
  runWithRequestLogContextAsync,
  type RequestLogContext,
} from "./request-log-context";

export type InstrumentedJobTickResult = {
  jobExecutionId: string;
  requestId: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
};

/**
 * Runs one job tick under a shared ALS context (requestId + jobExecutionId UUID).
 */
export const runInstrumentedJobTick = async (input: {
  module: SystemLogModule;
  jobName: string;
  completedEvent: SystemLogEvent;
  failedEvent: SystemLogEvent;
  completedMessage: string;
  failedMessage: string;
  run: (ctx: RequestLogContext) => Promise<Record<string, unknown> | void>;
}): Promise<InstrumentedJobTickResult | null> => {
  const ctx = beginJobLogContext(input.jobName);
  const started = Date.now();

  try {
    const metadata = await runWithRequestLogContextAsync(ctx, async () => {
      const result = await input.run(ctx);
      const durationMs = Date.now() - started;
      const skipCompleted =
        Boolean(result && typeof result === "object" && (result as { __skipCompleted?: boolean }).__skipCompleted);
      const meta = {
        jobName: input.jobName,
        durationMs,
        ...(result && typeof result === "object"
          ? Object.fromEntries(
              Object.entries(result).filter(([key]) => key !== "__skipCompleted"),
            )
          : {}),
      };
      if (!skipCompleted) {
        systemLogger.info({
          module: input.module,
          event: input.completedEvent,
          message: input.completedMessage,
          jobExecutionId: ctx.jobExecutionId,
          metadata: meta,
        });
      }
      return meta;
    });

    return {
      jobExecutionId: ctx.jobExecutionId!,
      requestId: ctx.requestId,
      durationMs: Date.now() - started,
      metadata: metadata ?? undefined,
    };
  } catch (error) {
    systemLogger.error({
      module: input.module,
      event: input.failedEvent,
      message: input.failedMessage,
      jobExecutionId: ctx.jobExecutionId,
      error,
      metadata: {
        jobName: input.jobName,
        durationMs: Date.now() - started,
      },
    });
    return null;
  }
};
