import {
  flushSystemLogPersistSink,
  shutdownSystemLogPersistSink,
} from "./system-logs/persist-sink";

type OrderedShutdownFn = () => Promise<void>;

let orderedShutdown: OrderedShutdownFn | null = null;

/**
 * Register the process-wide ordered resource shutdown (HTTP → jobs → sink → SQL).
 * Registered by server bootstrap to avoid circular imports with fatal-shutdown.
 */
export const registerOrderedShutdown = (fn: OrderedShutdownFn): void => {
  orderedShutdown = fn;
};

export const resetOrderedShutdownForTests = (): void => {
  orderedShutdown = null;
};

/**
 * Run the registered ordered shutdown, or a sink-only fallback when unset (tests / early boot).
 */
export const runOrderedShutdown = async (): Promise<void> => {
  if (orderedShutdown) {
    await orderedShutdown();
    return;
  }
  try {
    await flushSystemLogPersistSink();
  } catch {
    /* ignore */
  }
  try {
    await shutdownSystemLogPersistSink({ timeoutMs: 3_000 });
  } catch {
    /* ignore */
  }
};
