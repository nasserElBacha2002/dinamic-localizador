import type { SystemLogLevel } from "../../constants/system-logs";
import type {
  SystemLogMetadata,
  SystemRuntimeLogDetail,
  SystemRuntimeLogSummaryRow,
  SystemRuntimeLogRawRow,
} from "../../types/system-logs";
import { env } from "../../config/env";
import {
  sanitizeSystemLogMessage,
  sanitizeSystemLogMetadata,
  maskSensitiveFreeText,
} from "./sanitize";

const truncate = (value: string, max: number): string => {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, Math.max(0, max - 14))}…[truncated]`;
};

const sanitizeNullableText = (value: string | null | undefined, max: number): string | null => {
  if (value == null || value === "") {
    return null;
  }
  return truncate(maskSensitiveFreeText(value), max);
};

/** Second barrier: never trust rows already stored in SQL. */
export const toSystemRuntimeLogDetail = (row: SystemRuntimeLogRawRow): SystemRuntimeLogDetail => {
  const maxMeta = env.SYSTEM_LOGS_MAX_METADATA_BYTES;
  const maxStack = env.SYSTEM_LOGS_MAX_STACK_BYTES;

  let metadata: SystemLogMetadata | null = null;
  if (row.metadataJson != null && row.metadataJson !== "") {
    try {
      const parsed = JSON.parse(row.metadataJson) as SystemLogMetadata;
      metadata = sanitizeSystemLogMetadata(parsed, {
        maxMetadataBytes: maxMeta,
        maxStackBytes: maxStack,
      });
    } catch {
      metadata = { __parseError: true };
    }
  }

  return {
    id: row.id,
    schemaVersion: row.schemaVersion,
    occurredAt: row.occurredAt,
    level: row.level as SystemLogLevel,
    service: row.service,
    serviceInstanceId: row.serviceInstanceId,
    environment: row.environment,
    module: row.module,
    event: row.event,
    message: sanitizeSystemLogMessage(row.message),
    errorCode: row.errorCode,
    requestId: row.requestId,
    correlationId: row.correlationId,
    companyId: row.companyId,
    operationId: row.operationId,
    employeeId: row.employeeId,
    conversationId: row.conversationId,
    jobExecutionId: row.jobExecutionId,
    metadata,
    errorName: sanitizeNullableText(row.errorName, 200),
    errorMessage: sanitizeNullableText(row.errorMessage, 1000),
    errorStack: sanitizeNullableText(row.errorStack, maxStack),
    createdAt: row.createdAt,
  };
};

export const toSystemRuntimeLogSummary = (
  row: SystemRuntimeLogRawRow,
): SystemRuntimeLogSummaryRow => {
  const detail = toSystemRuntimeLogDetail(row);
  return {
    id: detail.id,
    occurredAt: detail.occurredAt,
    level: detail.level,
    service: detail.service,
    module: detail.module,
    event: detail.event,
    message: truncate(detail.message, 280),
    errorCode: detail.errorCode,
    companyId: detail.companyId,
    requestId: detail.requestId,
    correlationId: detail.correlationId,
    jobExecutionId: detail.jobExecutionId,
  };
};
