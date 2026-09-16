import { getPool } from "../database/connection";

export type DailyReportAudienceSchemaStatus =
  | { ok: true; fkName: string; referencedTable: string }
  | { ok: false; reason: string; fkName: string | null; referencedTable: string | null };

/**
 * Worker/deploy guard: new code inserts company_alert_recipients ids into deliveries.
 * Refuse to run while FK still targets company_report_email_recipients.
 */
export async function assertDailyReportAudienceSchemaReady(): Promise<DailyReportAudienceSchemaStatus> {
  const fks = await getPool().request().query(`
    SELECT
      fk.name AS fk_name,
      OBJECT_NAME(fk.referenced_object_id) AS referenced_table
    FROM sys.foreign_keys fk
    INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
    INNER JOIN sys.columns c
      ON c.object_id = fkc.parent_object_id
     AND c.column_id = fkc.parent_column_id
    WHERE fk.parent_object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries')
      AND c.name = N'recipient_id'
  `);

  const rows = fks.recordset as Array<{ fk_name: string; referenced_table: string }>;
  if (rows.length === 0) {
    return {
      ok: false,
      reason: "No recipient_id foreign key on company_daily_attendance_report_deliveries",
      fkName: null,
      referencedTable: null,
    };
  }

  const alertFk = rows.find((r) => r.referenced_table === "company_alert_recipients");
  if (alertFk) {
    return {
      ok: true,
      fkName: String(alertFk.fk_name),
      referencedTable: "company_alert_recipients",
    };
  }

  const legacy = rows[0];
  return {
    ok: false,
    reason:
      "Daily report audience schema incompatible: recipient_id FK still references " +
      `${legacy.referenced_table}. Apply migration 136 before enabling the worker.`,
    fkName: String(legacy.fk_name),
    referencedTable: String(legacy.referenced_table),
  };
}
