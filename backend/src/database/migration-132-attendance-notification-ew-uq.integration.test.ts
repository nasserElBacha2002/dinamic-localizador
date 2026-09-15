/**
 * Migration 132 — attendance notification employee_workday uniqueness.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 *
 * Shared DB may already have 132 applied. Always restore forward shape in after().
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  requireDinamicCompanyId,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { getPool } from "./connection";
import { applySqlScriptInTransaction, stripLegacyDatabaseUse } from "./run-migrations";

const ROOT = join(process.cwd(), "..");
const MIGRATION_132 = join(
  ROOT,
  "database/migrations/132_attendance_notification_employee_workday_uq.sql",
);
const ROLLBACK_132 = join(
  ROOT,
  "database/migrations/rollback/132_attendance_notification_employee_workday_uq_rollback.sql",
);

/** Strip legacy USE; runner already targets env.DB_NAME and owns the TDS transaction. */
const prepareScriptForRunner = (script: string): string =>
  script
    .split(/\r?\nGO\r?\n/gi)
    .map(stripLegacyDatabaseUse)
    .filter(Boolean)
    .join("\nGO\n");

const apply132Forward = async (): Promise<void> => {
  const pool = getPool();
  await applySqlScriptInTransaction(pool, prepareScriptForRunner(readFileSync(MIGRATION_132, "utf8")));
};

const apply132Rollback = async (): Promise<void> => {
  const pool = getPool();
  await applySqlScriptInTransaction(pool, prepareScriptForRunner(readFileSync(ROLLBACK_132, "utf8")));
};

type IndexShape = {
  present: boolean;
  isUnique: boolean;
  hasFilter: boolean;
  filterDefinition: string | null;
  columns: string[];
};

type FkShape = {
  present: boolean;
  parentColumns: string[];
  referencedTable: string | null;
  referencedColumns: string[];
};

const readIndexShape = async (name: string): Promise<IndexShape> => {
  const pool = getPool();
  const meta = await pool
    .request()
    .input("name", sql.NVarChar(256), name)
    .query(`
      SELECT i.is_unique, i.has_filter, i.filter_definition
      FROM sys.indexes i
      WHERE i.name = @name
        AND i.object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
    `);
  if (!meta.recordset[0]) {
    return {
      present: false,
      isUnique: false,
      hasFilter: false,
      filterDefinition: null,
      columns: [],
    };
  }
  const cols = await pool
    .request()
    .input("name", sql.NVarChar(256), name)
    .query(`
      SELECT c.name
      FROM sys.indexes i
      INNER JOIN sys.index_columns ic
        ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      INNER JOIN sys.columns c
        ON c.object_id = ic.object_id AND c.column_id = ic.column_id
      WHERE i.name = @name
        AND i.object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
      ORDER BY ic.key_ordinal
    `);
  return {
    present: true,
    isUnique: Boolean(meta.recordset[0].is_unique),
    hasFilter: Boolean(meta.recordset[0].has_filter),
    filterDefinition: meta.recordset[0].filter_definition
      ? String(meta.recordset[0].filter_definition)
      : null,
    columns: cols.recordset.map((r: { name: string }) => String(r.name)),
  };
};

const readFkShape = async (name: string): Promise<FkShape> => {
  const pool = getPool();
  const exists = await pool
    .request()
    .input("name", sql.NVarChar(256), name)
    .query(`SELECT 1 AS ok FROM sys.foreign_keys WHERE name = @name`);
  if (!exists.recordset[0]) {
    return { present: false, parentColumns: [], referencedTable: null, referencedColumns: [] };
  }
  const cols = await pool
    .request()
    .input("name", sql.NVarChar(256), name)
    .query(`
      SELECT
        pc.name AS parent_col,
        OBJECT_NAME(fkc.referenced_object_id) AS referenced_table,
        rc.name AS referenced_col,
        fkc.constraint_column_id
      FROM sys.foreign_keys fk
      INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
      INNER JOIN sys.columns pc
        ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
      INNER JOIN sys.columns rc
        ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
      WHERE fk.name = @name
      ORDER BY fkc.constraint_column_id
    `);
  return {
    present: true,
    parentColumns: cols.recordset.map((r: { parent_col: string }) => String(r.parent_col)),
    referencedTable: cols.recordset[0]
      ? String(cols.recordset[0].referenced_table)
      : null,
    referencedColumns: cols.recordset.map((r: { referenced_col: string }) =>
      String(r.referenced_col),
    ),
  };
};

const assertForward132Shape = async (): Promise<void> => {
  const pool = getPool();
  const col = await pool.request().query(`
    SELECT COL_LENGTH(N'dbo.whatsapp_attendance_notifications', N'employee_workday_id') AS len
  `);
  assert.ok(col.recordset[0]?.len != null, "employee_workday_id column required");

  const ewUq = await readIndexShape("UQ_whatsapp_attendance_notifications_ew_type_version");
  assert.equal(ewUq.present, true);
  assert.equal(ewUq.isUnique, true);
  assert.equal(ewUq.hasFilter, true);
  assert.ok(ewUq.filterDefinition?.includes("employee_workday_id"));
  assert.ok(ewUq.filterDefinition?.toUpperCase().includes("IS NOT NULL"));
  assert.deepEqual(ewUq.columns, [
    "employee_workday_id",
    "notification_type",
    "schedule_version",
  ]);

  const nullEwUq = await readIndexShape(
    "UQ_whatsapp_attendance_notifications_op_emp_type_version_null_ew",
  );
  assert.equal(nullEwUq.present, true);
  assert.equal(nullEwUq.isUnique, true);
  assert.equal(nullEwUq.hasFilter, true);
  assert.ok(nullEwUq.filterDefinition?.toUpperCase().includes("IS NULL"));
  assert.deepEqual(nullEwUq.columns, [
    "operation_id",
    "employee_id",
    "notification_type",
    "schedule_version",
  ]);

  const ix = await readIndexShape("IX_whatsapp_attendance_notifications_employee_workday");
  assert.equal(ix.present, true);
  assert.equal(ix.hasFilter, true);
  assert.deepEqual(ix.columns, ["company_id", "employee_workday_id"]);

  const legacyOp = await readIndexShape(
    "UQ_whatsapp_attendance_notifications_operation_employee_type_version",
  );
  const legacyInv = await readIndexShape(
    "UQ_whatsapp_attendance_notifications_inventory_employee_type_version",
  );
  assert.equal(legacyOp.present, false);
  assert.equal(legacyInv.present, false);

  const fk = await readFkShape("FK_whatsapp_attendance_notifications_employee_workday_tenant");
  assert.equal(fk.present, true);
  assert.deepEqual(fk.parentColumns, ["company_id", "employee_workday_id"]);
  assert.equal(fk.referencedTable, "employee_workdays");
  assert.deepEqual(fk.referencedColumns, ["company_id", "id"]);
};

const assertLegacyUniquenessPresent = async (): Promise<void> => {
  const legacy = await readIndexShape(
    "UQ_whatsapp_attendance_notifications_operation_employee_type_version",
  );
  const nullEw = await readIndexShape(
    "UQ_whatsapp_attendance_notifications_op_emp_type_version_null_ew",
  );
  const ewUq = await readIndexShape("UQ_whatsapp_attendance_notifications_ew_type_version");
  assert.ok(
    legacy.present || nullEw.present || ewUq.present,
    "schema must retain uniqueness for notifications (legacy or Phase-3 filters)",
  );
};

const isSqlErrorNumber = (error: unknown, number: number): boolean =>
  Boolean(
    error &&
      typeof error === "object" &&
      "number" in error &&
      (error as { number?: number }).number === number,
  );

describeDatabaseIntegration("migration 132 attendance notification EW UQ (SQL)", () => {
  let companyId = "";
  let probeOperationId = "";
  let probeEmployeeId = "";
  let probeEwA = "";
  let probeEwB = "";
  const insertedNotificationIds: string[] = [];

  before(async () => {
    await setupDatabaseIntegration();
    companyId = await requireDinamicCompanyId();
    const pool = getPool();

    // Ensure forward shape before assertions (idempotent).
    await apply132Forward();
    await assertForward132Shape();

    const employee = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM dbo.employees WHERE company_id = @companyId AND active = 1
      `);
    probeEmployeeId = String(employee.recordset[0]?.id ?? "");
    assert.ok(probeEmployeeId);

    const service = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM dbo.operational_locations
        WHERE company_id = @companyId AND active = 1
      `);
    const serviceId = String(service.recordset[0]?.id ?? "");
    assert.ok(serviceId);

    const op = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .query(`
        INSERT INTO dbo.scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes,
          early_tolerance_source, late_tolerance_source, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, N'ONE_TIME',
          SYSUTCDATETIME(), DATEADD(HOUR, 8, SYSUTCDATETIME()),
          30, 30, N'CUSTOM', N'CUSTOM', N'SCHEDULED'
        );
      `);
    probeOperationId = String(op.recordset[0].id);

    const owA = randomUUID();
    const owB = randomUUID();
    probeEwA = randomUUID();
    probeEwB = randomUUID();
    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, probeOperationId)
      .input("owA", sql.UniqueIdentifier, owA)
      .input("owB", sql.UniqueIdentifier, owB)
      .input("ewA", sql.UniqueIdentifier, probeEwA)
      .input("ewB", sql.UniqueIdentifier, probeEwB)
      .input("employeeId", sql.UniqueIdentifier, probeEmployeeId)
      .query(`
        INSERT INTO dbo.operation_workdays (
          id, company_id, operation_id, work_date,
          expected_start_at, expected_end_at,
          early_tolerance_minutes, late_tolerance_minutes,
          schedule_version, status
        )
        VALUES
          (@owA, @companyId, @operationId, CAST(SYSUTCDATETIME() AS DATE),
           SYSUTCDATETIME(), DATEADD(HOUR, 4, SYSUTCDATETIME()), 30, 30, 1, N'ACTIVE'),
          (@owB, @companyId, @operationId, DATEADD(DAY, 1, CAST(SYSUTCDATETIME() AS DATE)),
           DATEADD(DAY, 1, SYSUTCDATETIME()), DATEADD(DAY, 1, DATEADD(HOUR, 4, SYSUTCDATETIME())),
           30, 30, 1, N'ACTIVE');

        INSERT INTO dbo.employee_workdays (
          id, company_id, operation_workday_id, employee_id, expectation_status
        )
        VALUES
          (@ewA, @companyId, @owA, @employeeId, N'EXPECTED'),
          (@ewB, @companyId, @owB, @employeeId, N'EXPECTED');
      `);
  });

  after(async () => {
    const pool = getPool();
    try {
      if (insertedNotificationIds.length) {
        for (const id of insertedNotificationIds) {
          await pool
            .request()
            .input("id", sql.UniqueIdentifier, id)
            .query(`DELETE FROM dbo.whatsapp_attendance_notifications WHERE id = @id`);
        }
      }
      if (probeOperationId) {
        await pool
          .request()
          .input("operationId", sql.UniqueIdentifier, probeOperationId)
          .query(`
            DELETE FROM dbo.whatsapp_attendance_notifications WHERE operation_id = @operationId;
            DELETE FROM dbo.employee_workdays WHERE operation_workday_id IN (
              SELECT id FROM dbo.operation_workdays WHERE operation_id = @operationId
            );
            DELETE FROM dbo.operation_workdays WHERE operation_id = @operationId;
            DELETE FROM dbo.scheduled_operations WHERE id = @operationId;
          `);
      }
    } catch (error) {
      console.warn("[migration-132] probe cleanup failed", error);
    }

    try {
      await apply132Forward();
      await assertForward132Shape();
    } catch (error) {
      console.warn("[migration-132] schema restore failed", error);
    }

    await teardownDatabaseIntegration();
  });

  it("forward definition of indexes and FK matches Phase 3 contract", async () => {
    await assertForward132Shape();
  });

  it("second execution of migration 132 is idempotent", async () => {
    await apply132Forward();
    await assertForward132Shape();
  });

  it("injected failure after dropping previous UQ rolls back (uniqueness restored)", async () => {
    const pool = getPool();
    await assertForward132Shape();

    // Disposable probe table proves transactional DDL rollback.
    const probe = `dbo.__m132_tx_probe_${Date.now().toString(36)}`;
    await assert.rejects(
      () =>
        applySqlScriptInTransaction(
          pool,
          `
CREATE TABLE ${probe} (id INT NOT NULL);
GO
INSERT INTO ${probe} (id) VALUES (1);
GO
THROW 59932, 'injected probe failure', 1;
GO
`,
        ),
      (error: unknown) => isSqlErrorNumber(error, 59932),
    );
    const probeExists = await pool.request().query(`SELECT OBJECT_ID(N'${probe}', N'U') AS oid`);
    assert.equal(probeExists.recordset[0].oid, null);

    // Mirror 132's dangerous mid-path: drop Phase-3 UQs then fail — runner TX must restore.
    const failingScript = `
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_whatsapp_attendance_notifications_ew_type_version'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
)
BEGIN
    DROP INDEX UQ_whatsapp_attendance_notifications_ew_type_version
        ON dbo.whatsapp_attendance_notifications;
END;
GO
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_whatsapp_attendance_notifications_op_emp_type_version_null_ew'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
)
BEGIN
    DROP INDEX UQ_whatsapp_attendance_notifications_op_emp_type_version_null_ew
        ON dbo.whatsapp_attendance_notifications;
END;
GO
THROW 59933, 'injected after dropping Phase-3 UQs', 1;
GO
`;

    await assert.rejects(
      () => applySqlScriptInTransaction(pool, failingScript),
      (error: unknown) => isSqlErrorNumber(error, 59933),
    );

    await assertLegacyUniquenessPresent();
    await assertForward132Shape();
  });

  it("normal rollback then forward restore", async () => {
    const pool = getPool();
    await apply132Rollback();

    const ewUq = await readIndexShape("UQ_whatsapp_attendance_notifications_ew_type_version");
    assert.equal(ewUq.present, false);
    const legacy = await readIndexShape(
      "UQ_whatsapp_attendance_notifications_operation_employee_type_version",
    );
    assert.equal(legacy.present, true);
    assert.equal(legacy.isUnique, true);
    assert.deepEqual(legacy.columns, [
      "operation_id",
      "employee_id",
      "notification_type",
      "schedule_version",
    ]);

    const col = await pool.request().query(`
      SELECT COL_LENGTH(N'dbo.whatsapp_attendance_notifications', N'employee_workday_id') AS len
    `);
    assert.equal(col.recordset[0]?.len ?? null, null);

    await apply132Forward();
    await assertForward132Shape();
  });

  it("rollback blocked (50132) when collapsing EW rows would violate legacy UQ", async () => {
    const pool = getPool();
    await assertForward132Shape();

    const insertEwScoped = async (ewId: string): Promise<string> => {
      const result = await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("operationId", sql.UniqueIdentifier, probeOperationId)
        .input("employeeId", sql.UniqueIdentifier, probeEmployeeId)
        .input("ewId", sql.UniqueIdentifier, ewId)
        .query(`
          INSERT INTO dbo.whatsapp_attendance_notifications (
            company_id, operation_id, employee_id, employee_workday_id,
            notification_type, status, attempt_count, schedule_version, reminder_source
          )
          OUTPUT INSERTED.id
          VALUES (
            @companyId, @operationId, @employeeId, @ewId,
            N'ARRIVAL_REMINDER_15_MIN', N'PENDING', 0, 1, N'AUTOMATIC'
          );
        `);
      const id = String(result.recordset[0].id);
      insertedNotificationIds.push(id);
      return id;
    };

    await insertEwScoped(probeEwA);
    await insertEwScoped(probeEwB);

    await assert.rejects(
      () => apply132Rollback(),
      (error: unknown) => isSqlErrorNumber(error, 50132),
    );

    // Still on Phase-3 shape after blocked rollback.
    await assertForward132Shape();

    for (const id of [...insertedNotificationIds]) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM dbo.whatsapp_attendance_notifications WHERE id = @id`);
    }
    insertedNotificationIds.length = 0;

    await apply132Forward();
    await assertForward132Shape();
  });
});
