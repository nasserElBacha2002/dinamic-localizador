import type { SystemLogEvent, SystemLogLevel, SystemLogModule } from "../constants/system-logs";

export type SystemLogSerializedError = {
  name: string;
  message: string;
  stack?: string;
};

/** Allowlisted primitive/object bag after sanitization. */
export type SystemLogMetadata = Record<string, unknown>;

export type SystemLogInput = {
  level: SystemLogLevel;
  module: SystemLogModule;
  event: SystemLogEvent;
  message: string;
  errorCode?: string | null;
  companyId?: string | null;
  operationId?: string | null;
  employeeId?: string | null;
  conversationId?: string | null;
  jobExecutionId?: string | null;
  correlationId?: string | null;
  requestId?: string | null;
  metadata?: SystemLogMetadata | null;
  error?: unknown;
};

export type SystemLogRecord = {
  schemaVersion: 1;
  timestamp: string;
  level: SystemLogLevel;
  service: string;
  serviceInstanceId: string | null;
  environment: string;
  module: string;
  event: string;
  message: string;
  errorCode: string | null;
  requestId: string | null;
  correlationId: string | null;
  companyId: string | null;
  operationId: string | null;
  employeeId: string | null;
  conversationId: string | null;
  jobExecutionId: string | null;
  metadata: SystemLogMetadata | null;
  error: SystemLogSerializedError | null;
};

/** Raw DB row before presentation sanitization. */
export type SystemRuntimeLogRawRow = {
  id: string;
  schemaVersion: number;
  occurredAt: string;
  level: string;
  service: string;
  serviceInstanceId: string | null;
  environment: string;
  module: string;
  event: string;
  message: string;
  errorCode: string | null;
  requestId: string | null;
  correlationId: string | null;
  companyId: string | null;
  operationId: string | null;
  employeeId: string | null;
  conversationId: string | null;
  jobExecutionId: string | null;
  /** Raw JSON text from DB; null when column not selected. */
  metadataJson: string | null;
  errorName: string | null;
  errorMessage: string | null;
  errorStack: string | null;
  createdAt: string;
};

/** List/context DTO — no metadata/stack/MAX columns. */
export type SystemRuntimeLogSummaryRow = {
  id: string;
  occurredAt: string;
  level: SystemLogLevel;
  service: string;
  module: string;
  event: string;
  message: string;
  errorCode: string | null;
  companyId: string | null;
  requestId: string | null;
  correlationId: string | null;
  jobExecutionId: string | null;
};

/** Detail DTO — sanitized for Platform Admin. */
export type SystemRuntimeLogDetail = {
  id: string;
  schemaVersion: number;
  occurredAt: string;
  level: SystemLogLevel;
  service: string;
  serviceInstanceId: string | null;
  environment: string;
  module: string;
  event: string;
  message: string;
  errorCode: string | null;
  requestId: string | null;
  correlationId: string | null;
  companyId: string | null;
  operationId: string | null;
  employeeId: string | null;
  conversationId: string | null;
  jobExecutionId: string | null;
  metadata: SystemLogMetadata | null;
  errorName: string | null;
  errorMessage: string | null;
  errorStack: string | null;
  createdAt: string;
};

/** @deprecated Prefer Summary/Detail types for API responses. */
export type SystemRuntimeLogRow = SystemRuntimeLogDetail;

export type SystemLogContextRow = SystemRuntimeLogSummaryRow;
