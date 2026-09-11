import { runOrderedShutdown } from "../process-lifecycle";
import { systemLogger } from "./logger";

type ExitFn = (code: number) => void;

let fatalInProgress = false;
let exitInvoked = false;

/**
 * Single coordinator for fatal process failures.
 * Logs once, reuses ordered resource shutdown, then exits exactly once.
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

  const exitOnce = (code: number): void => {
    if (exitInvoked) {
      return;
    }
    exitInvoked = true;
    try {
      exit(code);
    } catch {
      /* ignore */
    }
  };

  const forceTimer = setTimeout(() => {
    exitOnce(1);
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
      await runOrderedShutdown();
    } catch {
      /* ignore */
    } finally {
      clearTimeout(forceTimer);
      exitOnce(1);
    }
  })();
};

export const resetFatalShutdownForTests = (): void => {
  fatalInProgress = false;
  exitInvoked = false;
};
