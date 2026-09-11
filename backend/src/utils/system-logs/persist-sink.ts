import { systemRuntimeLogRepository } from "../../repositories/system-runtime-log.repository";
import type { SystemLogRecord } from "../../types/system-logs";
import { registerSystemLogPersistSink } from "./logger";

const MAX_QUEUE = 200;

type ShutdownResult = {
  drained: number;
  droppedRemaining: number;
  timedOut: boolean;
};

type InsertFn = (record: SystemLogRecord) => Promise<void>;

let queue: SystemLogRecord[] = [];
let flushing = false;
let accepting = false;
let shutdownPromise: Promise<ShutdownResult> | null = null;
let droppedOverflow = 0;
let insertRecord: InsertFn = (record) => systemRuntimeLogRepository.insert(record);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const flushOnce = async (): Promise<number> => {
  if (flushing) {
    return 0;
  }
  flushing = true;
  let drained = 0;
  try {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) {
        break;
      }
      try {
        await insertRecord(next);
        drained += 1;
      } catch {
        // Fail-open: drop this record; never throw into callers.
      }
    }
  } finally {
    flushing = false;
  }
  return drained;
};

const kickFlush = (): void => {
  if (!accepting && queue.length === 0) {
    return;
  }
  void flushOnce().then(() => {
    if (queue.length > 0 && !shutdownPromise) {
      kickFlush();
    }
  });
};

export const enqueueSystemLogPersist = (record: SystemLogRecord): void => {
  if (!accepting) {
    return;
  }
  if (queue.length >= MAX_QUEUE) {
    queue.shift();
    droppedOverflow += 1;
  }
  queue.push(record);
  kickFlush();
};

export const initSystemLogPersistSink = (): void => {
  accepting = true;
  shutdownPromise = null;
  registerSystemLogPersistSink(enqueueSystemLogPersist);
};

export const flushSystemLogPersistSink = async (): Promise<number> => {
  let total = 0;
  for (let i = 0; i < 50 && queue.length > 0; i += 1) {
    while (flushing) {
      await sleep(10);
    }
    total += await flushOnce();
  }
  return total;
};

export const shutdownSystemLogPersistSink = async (input?: {
  timeoutMs?: number;
}): Promise<ShutdownResult> => {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  const timeoutMs = input?.timeoutMs ?? 5_000;
  shutdownPromise = (async (): Promise<ShutdownResult> => {
    accepting = false;
    registerSystemLogPersistSink(null);

    const started = Date.now();
    let drained = 0;

    while (queue.length > 0 || flushing) {
      if (Date.now() - started >= timeoutMs) {
        const droppedRemaining = queue.length;
        queue = [];
        return { drained, droppedRemaining, timedOut: true };
      }
      if (flushing) {
        await sleep(25);
        continue;
      }
      drained += await flushOnce();
    }

    return { drained, droppedRemaining: 0, timedOut: false };
  })();

  return shutdownPromise;
};

export const resetSystemLogPersistSinkForTests = (): void => {
  accepting = false;
  flushing = false;
  shutdownPromise = null;
  queue = [];
  droppedOverflow = 0;
  insertRecord = (record) => systemRuntimeLogRepository.insert(record);
  registerSystemLogPersistSink(null);
};

export const setSystemLogPersistInsertForTests = (fn: InsertFn): void => {
  insertRecord = fn;
};

export const getSystemLogPersistSinkStatsForTests = (): {
  queueLength: number;
  accepting: boolean;
  droppedOverflow: number;
} => ({
  queueLength: queue.length,
  accepting,
  droppedOverflow,
});

export const SYSTEM_LOG_PERSIST_MAX_QUEUE = MAX_QUEUE;
