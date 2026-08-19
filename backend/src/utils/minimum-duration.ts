import { randomInt } from "node:crypto";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Pads an async operation to at least minMs plus jitter.
 * Timing mitigation against obvious enumeration — not cryptographic constant-time.
 */
export async function withMinimumDuration<T>(
  operation: () => Promise<T>,
  options: { minMs: number; jitterMs: number; now?: () => number; wait?: (ms: number) => Promise<void> },
): Promise<T> {
  const now = options.now ?? Date.now;
  const wait = options.wait ?? sleep;
  const minMs = Math.max(0, options.minMs);
  const jitterMs = Math.max(0, options.jitterMs);
  const jitter = jitterMs === 0 ? 0 : randomInt(0, jitterMs + 1);
  const targetMs = minMs + jitter;
  const startedAt = now();

  try {
    return await operation();
  } finally {
    const elapsed = now() - startedAt;
    const remaining = targetMs - elapsed;
    if (remaining > 0) {
      await wait(remaining);
    }
  }
}
