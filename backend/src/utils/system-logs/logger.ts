import { env } from "../../config/env";
import type { SystemLogInput, SystemLogRecord } from "../../types/system-logs";
import { getRequestLogContext } from "./request-log-context";
import {
  sanitizeSystemLogMessage,
  sanitizeSystemLogMetadata,
  serializeErrorForSystemLog,
} from "./sanitize";

type PersistFn = (record: SystemLogRecord) => void;

let persistFn: PersistFn | null = null;

/** Wire the SQL sink after module init to avoid circular imports. */
export const registerSystemLogPersistSink = (fn: PersistFn | null): void => {
  persistFn = fn;
};

const parseInfoAllowlist = (): Set<string> => {
  const raw = env.SYSTEM_LOGS_INFO_EVENT_ALLOWLIST ?? "";
  return new Set(
    raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
};

const shouldPersist = (record: SystemLogRecord): boolean => {
  if (!env.SYSTEM_LOGS_ENABLED) {
    return false;
  }
  const levels = env.SYSTEM_LOGS_PERSIST_LEVELS;
  if (!levels.includes(record.level)) {
    return false;
  }
  if (record.level === "info") {
    return parseInfoAllowlist().has(record.event);
  }
  return true;
};

const buildRecord = (input: SystemLogInput): SystemLogRecord => {
  const ctx = getRequestLogContext();
  const maxMeta = env.SYSTEM_LOGS_MAX_METADATA_BYTES;
  const maxStack = env.SYSTEM_LOGS_MAX_STACK_BYTES;

  return {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    level: input.level,
    service: env.API_SERVICE_NAME,
    serviceInstanceId: env.SYSTEM_LOGS_SERVICE_INSTANCE_ID || null,
    environment: env.NODE_ENV,
    module: String(input.module).slice(0, 80),
    event: String(input.event).slice(0, 120),
    message: sanitizeSystemLogMessage(input.message),
    errorCode: input.errorCode ? String(input.errorCode).slice(0, 80) : null,
    requestId: input.requestId ?? ctx?.requestId ?? null,
    correlationId: input.correlationId ?? ctx?.correlationId ?? null,
    companyId: input.companyId ?? null,
    operationId: input.operationId ?? null,
    employeeId: input.employeeId ?? null,
    conversationId: input.conversationId ?? null,
    jobExecutionId: input.jobExecutionId ?? ctx?.jobExecutionId ?? null,
    metadata: sanitizeSystemLogMetadata(input.metadata ?? null, {
      maxMetadataBytes: maxMeta,
      maxStackBytes: maxStack,
    }),
    error: serializeErrorForSystemLog(input.error, maxStack),
  };
};

const writeStdout = (record: SystemLogRecord): void => {
  try {
    process.stdout.write(`${JSON.stringify(record)}\n`);
  } catch {
    /* never throw */
  }
};

const emit = (input: SystemLogInput): SystemLogRecord => {
  const record = buildRecord(input);
  writeStdout(record);
  if (shouldPersist(record) && persistFn) {
    try {
      persistFn(record);
    } catch {
      /* sink fail-open */
    }
  }
  return record;
};

export const systemLogger = {
  info: (input: Omit<SystemLogInput, "level">): SystemLogRecord =>
    emit({ ...input, level: "info" }),
  warn: (input: Omit<SystemLogInput, "level">): SystemLogRecord =>
    emit({ ...input, level: "warn" }),
  error: (input: Omit<SystemLogInput, "level">): SystemLogRecord =>
    emit({ ...input, level: "error" }),
};

export const buildSystemLogRecordForTests = buildRecord;
