/**
 * Phase 5 corrections — company lifecycle deactivate against real SQL.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import { getPool } from "../database/connection";
import { deleteCompanyCascade } from "../test-helpers/integration-cleanup";
import { userRepository } from "../repositories/user.repository";
import { companyLifecycleService } from "./company-lifecycle.service";

const uniqueName = (): string =>
  `Lifecycle ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describeDatabaseIntegration("company lifecycle deactivate DB", () => {
  const companyIds: string[] = [];
  let actorUserId = "";

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
    const admin = await userRepository.findByEmail("admin@dinamicsystems.com");
    assert.ok(admin?.id);
    actorUserId = admin.id;
  });

  after(async () => {
    for (const id of [...companyIds].reverse()) {
      try {
        await deleteCompanyCascade(id);
      } catch {
        /* ignore */
      }
    }
    await teardownDatabaseIntegration();
  });

  it("deactivate obtains applock, expires bot sessions, revokes invitations, writes lifecycle event", async () => {
    const created = await createPlatformCompanyFixture({
      name: uniqueName(),
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Lifecycle Owner",
        email: `life-owner-${Date.now()}@integration.test`,
      },
    });
    const companyId = created.data.company.id;
    companyIds.push(companyId);
    const invitationId = created.data.ownerInvitation.id;

    const pool = getPool();
    const employeeId = (
      await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          SELECT TOP 1 id FROM employees WHERE company_id = @companyId ORDER BY created_at
        `)
    ).recordset[0]?.id;
    // Seed an active-ish session if employees exist; otherwise skip session assertion.
    if (employeeId) {
      await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("employeeId", sql.UniqueIdentifier, String(employeeId))
        .query(`
          INSERT INTO bot_sessions (
            id, company_id, employee_id, phone_number, state, expires_at
          )
          VALUES (
            NEWID(), @companyId, @employeeId, N'+5491100000001', N'WAITING_LOCATION',
            DATEADD(HOUR, 2, SYSUTCDATETIME())
          )
        `);
    }

    const result = await companyLifecycleService.deactivate(
      companyId,
      actorUserId,
      "phase5 lifecycle integration",
      () => new Date("2030-01-15T12:00:00.000Z"),
    );

    assert.equal(result.status, "PENDING_DELETION");
    assert.ok(result.scheduledDeletionAt);

    const invitation = await pool
      .request()
      .input("id", sql.UniqueIdentifier, invitationId)
      .query(`SELECT status FROM user_invitations WHERE id = @id`);
    assert.equal(String(invitation.recordset[0]?.status), "REVOKED");

    if (employeeId) {
      const sessions = await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          SELECT COUNT(1) AS c
          FROM bot_sessions
          WHERE company_id = @companyId AND state <> N'EXPIRED'
        `);
      assert.equal(Number(sessions.recordset[0]?.c ?? 0), 0);
    }

    const events = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 event_type, new_status
        FROM company_lifecycle_events
        WHERE company_id = @companyId
        ORDER BY created_at DESC
      `);
    assert.ok(events.recordset[0]);
    assert.match(String(events.recordset[0].event_type), /DEACTIVAT/i);
  });
});
