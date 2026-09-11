import type { SystemLogRecord } from "../types/system-logs";
import { systemLogger } from "../utils/system-logs/logger";
import {
  beginJobLogContext,
  runWithRequestLogContext,
} from "../utils/system-logs/request-log-context";

/**
 * Dev/test-only helpers to emit correlated system logs without Twilio/WhatsApp.
 * Do not wire these to production HTTP routes.
 */
export const emitSimulatedSystemLogBundle = (input?: {
  requestId?: string;
  includeTwilioFailure?: boolean;
}): { requestId: string; jobExecutionId: string } => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("SYSTEM_LOG_SIMULATION_FORBIDDEN_IN_PRODUCTION");
  }

  const jobCtx = beginJobLogContext("system-log-simulation");
  const requestId = input?.requestId ?? jobCtx.requestId;

  return runWithRequestLogContext(
    { ...jobCtx, requestId },
    () => {
      systemLogger.warn({
        module: "http",
        event: "http.request.rejected",
        message: "Simulated operational warning",
        metadata: { simulation: true },
      });
      systemLogger.error({
        module: "http",
        event: "http.request.failed",
        message: "Simulated HTTP 500",
        errorCode: "INTERNAL_SERVER_ERROR",
        error: new Error("simulated failure"),
        metadata: { simulation: true, method: "GET", route: "/api/health" },
      });
      if (input?.includeTwilioFailure !== false) {
        systemLogger.error({
          module: "twilio-outbound",
          event: "twilio.message.send.failed",
          message: "Simulated Twilio send failure",
          errorCode: "TWILIO_SEND_FAILED",
          metadata: { simulation: true, messageKind: "TEMPLATE" },
        });
      }
      systemLogger.error({
        module: "attendance-reminder",
        event: "attendance-reminder.run.failed",
        message: "Simulated reminder job failure",
        jobExecutionId: jobCtx.jobExecutionId,
        metadata: { simulation: true },
      });
      return { requestId, jobExecutionId: jobCtx.jobExecutionId! };
    },
  );
};

export type SimulatedSystemLogRecord = SystemLogRecord;
