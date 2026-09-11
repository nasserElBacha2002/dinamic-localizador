export type SystemLogLevel = "error" | "warn" | "info";

export type SystemLogMetadata = Record<string, unknown>;

/** List/context row — no metadata or stack. */
export interface SystemRuntimeLogSummaryRow {
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
}

export type SystemLogContextRow = SystemRuntimeLogSummaryRow;

/** Detail row — sanitized for Platform Admin. */
export interface SystemRuntimeLogDetail {
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
}

/** @deprecated Use SystemRuntimeLogSummaryRow / SystemRuntimeLogDetail */
export type SystemRuntimeLogRow = SystemRuntimeLogDetail;

export interface SystemLogsListFilters {
  from?: string;
  to?: string;
  level?: SystemLogLevel;
  module?: string;
  event?: string;
  companyId?: string;
  requestId?: string;
  correlationId?: string;
  operationId?: string;
  employeeId?: string;
  conversationId?: string;
  jobExecutionId?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface SystemLogsOptions {
  levels: SystemLogLevel[];
  modules: string[];
  events: string[];
  infoEventAllowlist: string[];
  queryMaxDays: number;
  retentionDays: number;
}

export interface SystemLogContextMeta {
  correlationKey: "requestId" | "correlationId" | "jobExecutionId" | null;
}
