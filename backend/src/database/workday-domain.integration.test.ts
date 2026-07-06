import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  requireDinamicCompanyId,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { getPool } from "../database/connection";
import { DEFAULT_OPERATION_TIMEZONE } from "../utils/operation-timezone";

describeDatabaseIntegration("workday domain migration backfill", () => {
  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("materializes exactly one operation_workday per ONE_TIME operation", async () => {
    const companyId = await requireDinamicCompanyId();
    const pool = getPool();
    const result = await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
      SELECT o.id
      FROM scheduled_operations o
      WHERE o.company_id = @companyId
        AND o.operation_kind = N'ONE_TIME'
      GROUP BY o.id
      HAVING (
        SELECT COUNT(*)
        FROM operation_workdays ow
        WHERE ow.operation_id = o.id
      ) <> 1
    `);

    assert.equal(result.recordset.length, 0);
  });

  it("uses canonical timezone fallback for work_date when company timezone is absent", async () => {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT TOP 1
        ow.work_date,
        CAST(
          (o.scheduled_start AT TIME ZONE 'UTC') AT TIME ZONE
          dbo.fn_resolve_operation_timezone_for_sql(N'${DEFAULT_OPERATION_TIMEZONE}')
          AS DATE
        ) AS expected_work_date
      FROM operation_workdays ow
      INNER JOIN scheduled_operations o ON o.id = ow.operation_id
      LEFT JOIN company_settings cs ON cs.company_id = o.company_id
      WHERE o.operation_kind = N'ONE_TIME'
        AND (cs.operation_timezone IS NULL OR cs.operation_timezone = N'')
    `);

    if (!result.recordset[0]) {
      return;
    }

    const row = result.recordset[0] as { work_date: Date; expected_work_date: Date };
    assert.equal(
      new Date(row.work_date).toISOString().slice(0, 10),
      new Date(row.expected_work_date).toISOString().slice(0, 10),
    );
  });

  it("links active attendance records to employee_workday_id", async () => {
    const companyId = await requireDinamicCompanyId();
    const pool = getPool();
    const result = await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
      SELECT COUNT(*) AS total
      FROM attendance_records ar
      WHERE ar.company_id = @companyId
        AND ar.validation_status IN (N'VALID', N'PENDING_REVIEW')
        AND ar.employee_workday_id IS NULL
    `);

    assert.equal(Number(result.recordset[0].total), 0);
  });
});
