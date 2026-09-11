import { systemRuntimeLogRepository } from "../../repositories/system-runtime-log.repository";
import type { SystemLogRecord } from "../../types/system-logs";
import { registerSystemLogPersistSink } from "./logger";

const MAX_QUEUE = 200;
const queue: SystemLogRecord[] = [];
let flushing = false;
let sinkEnabled = true;

const flushQueue = async (): Promise<void> => {
  if (flushing || !sinkEnabled) {
    return;
  }
  flushing = true;
  try {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) {
        break;
      }
      try {
        await systemRuntimeLogRepository.insert(next);
      } catch {
        // Fail-open: never throw into callers. Drop this record.
      }
    }
  } finally {
    flushing = false;
    if (queue.length > 0) {
      void flushQueue();
    }
  }
};

export const enqueueSystemLogPersist = (record: SystemLogRecord): void => {
  if (!sinkEnabled) {
    return;
  }
  if (queue.length >= MAX_QUEUE) {
    queue.shift();
  }
  queue.push(record);
  void flushQueue();
};

export const initSystemLogPersistSink = (): void => {
  sinkEnabled = true;
  registerSystemLogPersistSink(enqueueSystemLogPersist);
};

export const disableSystemLogPersistSinkForTests = (): void => {
  sinkEnabled = false;
  queue.length = 0;
  registerSystemLogPersistSink(null);
};

export const flushSystemLogPersistSinkForTests = async (): Promise<void> => {
  await flushQueue();
};
