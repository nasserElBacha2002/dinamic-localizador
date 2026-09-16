import sql from "mssql";
import { getPool } from "../database/connection";

export type HybridShiftStateRow = {
  kind: "WORKDAY_SHIFT_ON_SINGLE" | "ASSIGNMENT_SHIFT_ON_SINGLE" | "WORKDAY_NULL_ON_MULTI" | "ASSIGNMENT_NULL_ON_MULTI";
  companyId: string;
  operationId: string;
  rowId: string;
};

/** Read-only audit for hybrid SINGLE/MULTI_SHIFT states (Phase 1 / ops). */
export const listHybridShiftScheduleStates = async (
  companyId?: string,
): Promise<HybridShiftStateRow[]> => {
  const request = getPool().request();
  if (companyId) {
    request.input("companyId", sql.UniqueIdentifier, companyId);
  }

  const result = await request.query(`
    SELECT N'WORKDAY_SHIFT_ON_SINGLE' AS kind, ow.company_id, ow.operation_id, ow.id AS row_id
    FROM dbo.operation_workdays ow
    INNER JOIN dbo.scheduled_operations so
      ON so.company_id = ow.company_id AND so.id = ow.operation_id
    WHERE so.schedule_mode = N'SINGLE'
      AND ow.operation_shift_id IS NOT NULL
      ${companyId ? "AND ow.company_id = @companyId" : ""}

    UNION ALL

    SELECT N'ASSIGNMENT_SHIFT_ON_SINGLE', oa.company_id, oa.operation_id, oa.id
    FROM dbo.operation_assignments oa
    INNER JOIN dbo.scheduled_operations so
      ON so.company_id = oa.company_id AND so.id = oa.operation_id
    WHERE so.schedule_mode = N'SINGLE'
      AND oa.operation_shift_id IS NOT NULL
      ${companyId ? "AND oa.company_id = @companyId" : ""}

    UNION ALL

    SELECT N'WORKDAY_NULL_ON_MULTI', ow.company_id, ow.operation_id, ow.id
    FROM dbo.operation_workdays ow
    INNER JOIN dbo.scheduled_operations so
      ON so.company_id = ow.company_id AND so.id = ow.operation_id
    WHERE so.schedule_mode = N'MULTI_SHIFT'
      AND ow.operation_shift_id IS NULL
      ${companyId ? "AND ow.company_id = @companyId" : ""}

    UNION ALL

    SELECT N'ASSIGNMENT_NULL_ON_MULTI', oa.company_id, oa.operation_id, oa.id
    FROM dbo.operation_assignments oa
    INNER JOIN dbo.scheduled_operations so
      ON so.company_id = oa.company_id AND so.id = oa.operation_id
    WHERE so.schedule_mode = N'MULTI_SHIFT'
      AND oa.operation_shift_id IS NULL
      ${companyId ? "AND oa.company_id = @companyId" : ""}
  `);

  return result.recordset.map((row) => ({
    kind: String(row.kind) as HybridShiftStateRow["kind"],
    companyId: String(row.company_id),
    operationId: String(row.operation_id),
    rowId: String(row.row_id),
  }));
};
