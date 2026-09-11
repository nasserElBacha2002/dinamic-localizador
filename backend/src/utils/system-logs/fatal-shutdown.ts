import { systemLogger } from "./logger";
import { flushSystemLogPersistSink, shutdownSystemLogPersistSink } from "./persist-sink";

type ExitFn = (code: number) => void;

let fatalInProgress = false;

/**
 * Single coordinator for fatal process failures.
 * Logs once, best-effort drain, then exits. Never recurses into itself.
 */
export const initiateFatalShutdown = (input: {
  event: "process.uncaughtException" | "process.unhandledRejection";
  message: string;
  error: unknown;
  exit?: ExitFn;
  forceExitAfterMs?: number;
}): void => {
  if (fatalInProgress) {
    return;
  }
  fatalInProgress = true;

  const exit: ExitFn = input.exit ?? ((code) => process.exit(code));
  const forceExitAfterMs = input.forceExitAfterMs ?? 8_000;

  const forceTimer = setTimeout(() => {
    try {
      exit(1);
    } catch {
      /* ignore */
    }
  }, forceExitAfterMs);
  forceTimer.unref?.();

  try {
    systemLogger.error({
      module: "http",
      event: input.event,
      message: input.message,
      error: input.error,
    });
  } catch {
    try {
      process.stderr.write(
        `${JSON.stringify({
          level: "error",
          event: input.event,
          message: "fatal shutdown logger failed",
        })}\n`,
      );
    } catch {
      /* ignore */
    }
  }

  void (async () => {
    try {
      await flushSystemLogPersistSink();
      await shutdownSystemLogPersistSink({ timeoutMs: 3_000 });
    } catch {
      /* ignore */
    } finally {
      clearTimeout(forceTimer);
      exit(1);
    }
  })();
};

export const resetFatalShutdownForTests = (): void => {
  fatalInProgress = false;
};
