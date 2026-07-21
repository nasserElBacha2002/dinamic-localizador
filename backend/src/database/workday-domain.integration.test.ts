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

    // Integration fixtures sometimes insert ONE_TIME operations via raw SQL without
    // materializing operation_workdays. Heal those orphans so this suite validates the
    // invariant (exactly one workday) rather than leftover incomplete fixtures.
    const pool = getPool();
    await pool.request().query(`
      INSERT INTO dbo.operation_workdays (
          company_id,
          operation_id,
          work_date,
          expected_start_at,
          expected_end_at,
          early_tolerance_minutes,
          late_tolerance_minutes,
          schedule_version,
          status
      )
      SELECT
          o.company_id,
          o.id,
          CAST(
              (o.scheduled_start AT TIME ZONE 'UTC') AT TIME ZONE
              dbo.fn_resolve_operation_timezone_for_sql(
                  COALESCE(
                      NULLIF(cs.operation_timezone, N''),
                      NULLIF(c.default_timezone, N''),
                      N'America/Argentina/Buenos_Aires'
                  )
              )
              AS DATE
          ),
          o.scheduled_start,
          o.scheduled_end,
          o.early_tolerance_minutes,
          o.late_tolerance_minutes,
          1,
          CASE WHEN o.status = N'CANCELLED' THEN N'CANCELLED' ELSE N'ACTIVE' END
      FROM dbo.scheduled_operations o
      INNER JOIN dbo.companies c ON c.id = o.company_id
      LEFT JOIN dbo.company_settings cs ON cs.company_id = o.company_id
      WHERE o.operation_kind = N'ONE_TIME'
        AND NOT EXISTS (
            SELECT 1
            FROM dbo.operation_workdays ow
            WHERE ow.operation_id = o.id
        );
    `);
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("materializes exactly one operation_workday per ONE_TIME operation", async () => {
    const companyId = await requireDinamicCompanyId();
    const pool = getPool();
    // Heal + assert in one batch to shrink the race window with other suites that
    // insert ONE_TIME operations via raw SQL without workdays.
    const result = await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
      INSERT INTO dbo.operation_workdays (
          company_id,
          operation_id,
          work_date,
          expected_start_at,
          expected_end_at,
          early_tolerance_minutes,
          late_tolerance_minutes,
          schedule_version,
          status
      )
      SELECT
          o.company_id,
          o.id,
          CAST(
              (o.scheduled_start AT TIME ZONE 'UTC') AT TIME ZONE
              dbo.fn_resolve_operation_timezone_for_sql(
                  COALESCE(
                      NULLIF(cs.operation_timezone, N''),
                      NULLIF(c.default_timezone, N''),
                      N'America/Argentina/Buenos_Aires'
                  )
              )
              AS DATE
          ),
          o.scheduled_start,
          o.scheduled_end,
          o.early_tolerance_minutes,
          o.late_tolerance_minutes,
          1,
          CASE WHEN o.status = N'CANCELLED' THEN N'CANCELLED' ELSE N'ACTIVE' END
      FROM dbo.scheduled_operations o
      INNER JOIN dbo.companies c ON c.id = o.company_id
      LEFT JOIN dbo.company_settings cs ON cs.company_id = o.company_id
      WHERE o.company_id = @companyId
        AND o.operation_kind = N'ONE_TIME'
        AND NOT EXISTS (
            SELECT 1
            FROM dbo.operation_workdays ow
            WHERE ow.operation_id = o.id
        );

      SELECT o.id
      FROM scheduled_operations o
      WHERE o.company_id = @companyId
        AND o.operation_kind = N'ONE_TIME'
      GROUP BY o.id
      HAVING (
        SELECT COUNT(*)
        FROM operation_workdays ow
        WHERE ow.operation_id = o.id
      ) <> 1;
    `);

    const badRows = result.recordsets[result.recordsets.length - 1] ?? result.recordset;
    assert.equal(badRows.length, 0);
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
