import sql from "mssql";
import type { SqlFilter } from "./sql-list-query";
import { applySqlFilters, buildWhereClause } from "./sql-list-query";

export interface ConversationListFilterCriteria {
  companyId?: string;
  employeeId?: string;
  from?: string;
  to?: string;
  flowType?: string;
  resultCode?: string;
  status?: string;
  hasError?: boolean;
}

/**
 * Single source of truth: each SQL predicate is paired with its parameter binding.
 * Applied before ORDER BY / OFFSET / FETCH so pagination runs on the filtered set.
 */
export function buildWhatsappConversationListFilters(
  filters: ConversationListFilterCriteria,
): SqlFilter[] {
  const parts: SqlFilter[] = [];

  if (filters.companyId) {
    parts.push({
      clause: "c.company_id = @companyId",
      apply: (request) => request.input("companyId", sql.UniqueIdentifier, filters.companyId),
    });
  }
  if (filters.employeeId) {
    parts.push({
      clause: "c.employee_id = @employeeId",
      apply: (request) => request.input("employeeId", sql.UniqueIdentifier, filters.employeeId),
    });
  }
  if (filters.status) {
    parts.push({
      clause: "c.status = @status",
      apply: (request) => request.input("status", sql.NVarChar(20), filters.status),
    });
  }
  if (filters.flowType) {
    parts.push({
      clause: "c.last_flow_type = @flowType",
      apply: (request) => request.input("flowType", sql.NVarChar(60), filters.flowType),
    });
  }
  if (filters.resultCode) {
    parts.push({
      clause: "c.last_result_code = @resultCode",
      apply: (request) => request.input("resultCode", sql.NVarChar(80), filters.resultCode),
    });
  }
  if (filters.hasError === true) {
    parts.push({
      clause: "c.error_count > 0",
      apply: () => undefined,
    });
  }
  if (filters.hasError === false) {
    parts.push({
      clause: "c.error_count = 0",
      apply: () => undefined,
    });
  }
  if (filters.from) {
    parts.push({
      clause: "c.last_activity_at >= @fromAt",
      apply: (request) => request.input("fromAt", sql.DateTime2, new Date(filters.from!)),
    });
  }
  if (filters.to) {
    parts.push({
      clause: "c.last_activity_at <= @toAt",
      apply: (request) => request.input("toAt", sql.DateTime2, new Date(filters.to!)),
    });
  }

  return parts;
}

/** Applies bindings and returns a WHERE clause (or empty string when no filters). */
export function applyWhatsappConversationListFilters(
  request: sql.Request,
  filters: ConversationListFilterCriteria,
): string {
  const parts = buildWhatsappConversationListFilters(filters);
  applySqlFilters(request, parts);
  return buildWhereClause(parts);
}
