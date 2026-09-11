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

export type SystemRuntimeLogRow = {
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
