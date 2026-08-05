export type RaceTimeoutResult<T> =
  | { timedOut: true }
  | { timedOut: false; value: T };

export const raceTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<RaceTimeoutResult<T>> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then((value) => ({ timedOut: false as const, value })),
      new Promise<{ timedOut: true }>((resolve) => {
        timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};
