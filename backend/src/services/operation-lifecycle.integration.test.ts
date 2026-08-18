/**
 * DB-backed ONE_TIME lifecycle reconciler: selection, CAS concurrency, tenant isolation.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  createIntegrationFixtureTracker,
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { getPool } from "../database/connection";
import { operationRepository } from "../repositories/operation.repository";
import { operationLifecycleService } from "./operation-lifecycle.service";
import type { Operation } from "../types/domain";

const NOW = new Date("2026-08-18T15:00:00.000Z");

describeDatabaseIntegration("ONE_TIME operation lifecycle SQL", () => {
  const fixtures = createIntegrationFixtureTracker();
  let companyA = "";
  let companyB = "";
  let serviceA = "";
  let serviceB = "";

  const ids: Record<string, string> = {};

  before(async () => {
    await setupDatabaseIntegration();
    const pool = getPool();

    const company = await pool.request().query(`
      SELECT TOP 1 id
      FROM companies
      WHERE status = N'ACTIVE' OR status IS NULL
      ORDER BY
        CASE WHEN name = N'Dinamic Systems' THEN 0 ELSE 1 END,
        created_at ASC
    `);
    companyA = String(company.recordset[0]?.id ?? "");
    assert.ok(companyA, "ACTIVE company required");

    const service = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyA)
      .query(`
        SELECT TOP 1 id FROM operational_locations
        WHERE company_id = @companyId AND active = 1
        ORDER BY created_at ASC
      `);
    serviceA = String(service.recordset[0]?.id ?? "");
    assert.ok(serviceA, "active operational_location required");

    const otherCompany = await pool.request().query(`
      INSERT INTO companies (name, default_timezone, status)
      OUTPUT INSERTED.id
      VALUES (N'Lifecycle Iso ${Date.now()}', N'America/Argentina/Buenos_Aires', N'ACTIVE')
    `);
    companyB = String(otherCompany.recordset[0].id);
    fixtures.trackCompany(companyB);

    await pool.request().input("companyId", sql.UniqueIdentifier, companyB).query(`
      INSERT INTO company_settings (
        company_id, operation_timezone, default_radius_meters,
        late_grace_minutes, early_leave_tolerance_minutes,
        require_checkout_location, allow_manual_attendance_corrections
      )
      VALUES (
        @companyId, N'America/Argentina/Buenos_Aires', 150, 15, 15, 1, 1
      )
    `);

    const locationB = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyB)
      .input("name", sql.NVarChar(150), `Lifecycle Loc ${Date.now()}`)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO operational_locations (
          company_id, name, address, locality, latitude, longitude, allowed_radius_meters, active
        )
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, N'Addr', N'CABA', -34.6, -58.4, 150, 1);
        SELECT id FROM @inserted;
      `);
    serviceB = String(locationB.recordset[0].id);
  });

  after(async () => {
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  const insertOperation = async (input: {
    companyId: string;
    serviceId: string;
    start: Date;
    end: Date | null;
    status: string;
    kind?: "ONE_TIME" | "RECURRING";
    lateToleranceMinutes?: number;
  }): Promise<string> => {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("serviceId", sql.UniqueIdentifier, input.serviceId)
      .input("scheduledStart", sql.DateTime2, input.kind === "RECURRING" ? null : input.start)
      .input("scheduledEnd", sql.DateTime2, input.kind === "RECURRING" ? null : input.end)
      .input("status", sql.NVarChar(30), input.status)
      .input("kind", sql.NVarChar(20), input.kind ?? "ONE_TIME")
      .input("lateTolerance", sql.Int, input.lateToleranceMinutes ?? 30)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, @kind, @scheduledStart, @scheduledEnd,
          60, @lateTolerance, @status
        )
      `);
    const id = String(result.recordset[0].id);
    fixtures.trackOperation(input.companyId, id);
    return id;
  };

  it("selects due ONE_TIME rows and ignores future, terminal, and RECURRING", async () => {
    ids.future = await insertOperation({
      companyId: companyA,
      serviceId: serviceA,
      start: new Date("2099-01-01T10:00:00.000Z"),
      end: new Date("2099-01-01T18:00:00.000Z"),
      status: "SCHEDULED",
    });
    ids.active = await insertOperation({
      companyId: companyA,
      serviceId: serviceA,
      start: new Date("2026-08-18T12:00:00.000Z"),
      end: new Date("2026-08-18T18:00:00.000Z"),
      status: "SCHEDULED",
    });
    ids.expiredScheduled = await insertOperation({
      companyId: companyA,
      serviceId: serviceA,
      start: new Date("2000-01-02T00:00:00.000Z"),
      end: new Date("2000-01-02T06:00:00.000Z"),
      status: "SCHEDULED",
    });
    ids.expiredInProgress = await insertOperation({
      companyId: companyA,
      serviceId: serviceA,
      start: new Date("2000-01-03T00:00:00.000Z"),
      end: new Date("2000-01-03T06:00:00.000Z"),
      status: "IN_PROGRESS",
    });
    ids.completed = await insertOperation({
      companyId: companyA,
      serviceId: serviceA,
      start: new Date("2000-01-04T00:00:00.000Z"),
      end: new Date("2000-01-04T06:00:00.000Z"),
      status: "COMPLETED",
    });
    ids.cancelled = await insertOperation({
      companyId: companyA,
      serviceId: serviceA,
      start: new Date("2000-01-05T00:00:00.000Z"),
      end: new Date("2000-01-05T06:00:00.000Z"),
      status: "CANCELLED",
    });
    ids.recurring = await insertOperation({
      companyId: companyA,
      serviceId: serviceA,
      start: new Date("2000-01-06T00:00:00.000Z"),
      end: null,
      status: "SCHEDULED",
      kind: "RECURRING",
    });
    ids.nullEndDue = await insertOperation({
      companyId: companyA,
      serviceId: serviceA,
      start: new Date("2026-08-18T11:00:00.000Z"),
      end: null,
      status: "SCHEDULED",
      lateToleranceMinutes: 30,
    });

    const selected = new Set<string>();
    let afterSortKey: Date | null = null;
    let afterId: string | null = null;
    const fixtureIds = new Set(Object.values(ids));
    for (let page = 0; page < 40; page += 1) {
      const due = await operationRepository.listOneTimeLifecycleDue({
        now: NOW,
        limit: 50,
        afterSortKey,
        afterId,
      });
      if (due.length === 0) {
        break;
      }
      for (const row of due) {
        if (fixtureIds.has(row.operation.id)) {
          selected.add(row.operation.id);
        }
      }
      afterSortKey = due[due.length - 1].sortKey;
      afterId = due[due.length - 1].operation.id;
    }

    assert.equal(selected.has(ids.future), false);
    assert.equal(selected.has(ids.active), true);
    assert.equal(selected.has(ids.expiredScheduled), true);
    assert.equal(selected.has(ids.expiredInProgress), true);
    assert.equal(selected.has(ids.completed), false);
    assert.equal(selected.has(ids.cancelled), false);
    assert.equal(selected.has(ids.recurring), false);
    assert.equal(selected.has(ids.nullEndDue), true);

    const load = async (id: string): Promise<Operation> => {
      const operation = await operationRepository.findById(companyA, id);
      assert.ok(operation);
      return operation;
    };

    assert.equal(
      (await operationLifecycleService.syncPersistedStatus(companyA, await load(ids.active), NOW)).status,
      "IN_PROGRESS",
    );
    assert.equal(
      (await operationLifecycleService.syncPersistedStatus(companyA, await load(ids.expiredScheduled), NOW))
        .status,
      "COMPLETED",
    );
    assert.equal(
      (await operationLifecycleService.syncPersistedStatus(companyA, await load(ids.expiredInProgress), NOW))
        .status,
      "COMPLETED",
    );
    assert.equal(
      (await operationLifecycleService.syncPersistedStatus(companyA, await load(ids.nullEndDue), NOW)).status,
      "COMPLETED",
    );

    assert.equal(
      (await operationLifecycleService.syncPersistedStatus(companyA, await load(ids.completed), NOW)).status,
      "COMPLETED",
    );
    assert.equal(
      (await operationLifecycleService.syncPersistedStatus(companyA, await load(ids.cancelled), NOW)).status,
      "CANCELLED",
    );
    assert.equal(
      (await operationLifecycleService.syncPersistedStatus(companyA, await load(ids.recurring), NOW)).status,
      "SCHEDULED",
    );
  });

  it("CAS: exactly one concurrent SCHEDULED → COMPLETED update; both callers observe COMPLETED", async () => {
    const operationId = await insertOperation({
      companyId: companyA,
      serviceId: serviceA,
      start: new Date("2000-02-01T00:00:00.000Z"),
      end: new Date("2000-02-01T06:00:00.000Z"),
      status: "SCHEDULED",
    });
    const operation = await operationRepository.findById(companyA, operationId);
    assert.ok(operation);

    const [first, second] = await Promise.all([
      operationLifecycleService.syncPersistedStatus(companyA, operation, NOW),
      operationLifecycleService.syncPersistedStatus(companyA, operation, NOW),
    ]);

    assert.equal(first.status, "COMPLETED");
    assert.equal(second.status, "COMPLETED");
    const persisted = await operationRepository.findById(companyA, operationId);
    assert.equal(persisted?.status, "COMPLETED");

    const replay = await operationRepository.promoteLifecycleStatus(
      companyA,
      operationId,
      "SCHEDULED",
      "COMPLETED",
    );
    assert.equal(replay, null);
    assert.equal((await operationRepository.findById(companyA, operationId))?.status, "COMPLETED");
  });

  it("does not promote another company's row (company_id isolation)", async () => {
    const opA = await insertOperation({
      companyId: companyA,
      serviceId: serviceA,
      start: new Date("2000-03-01T00:00:00.000Z"),
      end: new Date("2000-03-01T06:00:00.000Z"),
      status: "SCHEDULED",
    });
    const opB = await insertOperation({
      companyId: companyB,
      serviceId: serviceB,
      start: new Date("2000-03-01T00:00:00.000Z"),
      end: new Date("2000-03-01T06:00:00.000Z"),
      status: "SCHEDULED",
    });

    const wrongCompany = await operationRepository.promoteLifecycleStatus(
      companyB,
      opA,
      "SCHEDULED",
      "COMPLETED",
    );
    assert.equal(wrongCompany, null);
    assert.equal((await operationRepository.findById(companyA, opA))?.status, "SCHEDULED");

    const promotedB = await operationRepository.promoteLifecycleStatus(
      companyB,
      opB,
      "SCHEDULED",
      "COMPLETED",
    );
    assert.equal(promotedB?.status, "COMPLETED");
    assert.equal((await operationRepository.findById(companyA, opA))?.status, "SCHEDULED");
    assert.equal((await operationRepository.findById(companyB, opB))?.status, "COMPLETED");
  });
});
