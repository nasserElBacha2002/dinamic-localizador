/**
 * Operation assignment WhatsApp notification — SQL concurrency / lease evidence.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 *
 * Requires migration 091 (whatsapp_operation_assignment_notifications).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  createIntegrationFixtureTracker,
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { operationAssignmentNotificationRepository } from "../repositories/operation-assignment-notification.repository";
import { whatsappFlowTraceService } from "./whatsapp-flow-trace.service";

describeDatabaseIntegration("operation assignment notification sql concurrency", () => {
  const fixtures = createIntegrationFixtureTracker();
  const assignmentIds: string[] = [];
  let companyId = "";
  let employeeId = "";
  let serviceId = "";
  let operationId = "";
  let workDate = "";

  before(async () => {
    await setupDatabaseIntegration();
    const { getPool } = await import("../database/connection");
    const pool = getPool();

    const table = await pool.request().query(`
      SELECT OBJECT_ID(N'dbo.whatsapp_operation_assignment_notifications', N'U') AS oid
    `);
    assert.ok(
      table.recordset[0]?.oid,
      "migration 091 required: whatsapp_operation_assignment_notifications missing (apply pending migrations including 089-091)",
    );

    const company = await pool.request().query(`
      SELECT TOP 1 id
      FROM companies
      WHERE status = N'ACTIVE' OR status IS NULL
      ORDER BY
        CASE WHEN name = N'Dinamic Systems' THEN 0 ELSE 1 END,
        created_at ASC
    `);
    companyId = String(company.recordset[0]?.id ?? "");
    assert.ok(companyId, "ACTIVE company required");

    const service = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM operational_locations
        WHERE company_id = @companyId AND active = 1
        ORDER BY created_at ASC
      `);
    serviceId = String(service.recordset[0]?.id ?? "");
    assert.ok(serviceId, "active operational_location required");

    const phone = `+54911${Date.now().toString().slice(-8)}`;
    const emp = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), "Assign Notif Concurrency Emp")
      .input("phone", sql.NVarChar(30), phone)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, @phone, N'fijo', 1);
        SELECT id FROM @inserted;
      `);
    employeeId = String(emp.recordset[0].id);
    fixtures.trackEmployee(companyId, employeeId);

    const start = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
    start.setUTCHours(15, 0, 0, 0);
    const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
    workDate = start.toISOString().slice(0, 10);

    const op = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, start)
      .input("scheduledEnd", sql.DateTime2, end)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, N'ONE_TIME', @scheduledStart, @scheduledEnd,
          15, 15, N'SCHEDULED'
        )
      `);
    operationId = String(op.recordset[0].id);
    fixtures.trackOperation(companyId, operationId);
  });

  after(async () => {
    const { getPool } = await import("../database/connection");
    const pool = getPool();
    for (const assignmentId of assignmentIds) {
      await pool
        .request()
        .input("assignmentId", sql.UniqueIdentifier, assignmentId)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          DELETE FROM whatsapp_operation_assignment_notification_send_attempts
          WHERE notification_id IN (
            SELECT id FROM whatsapp_operation_assignment_notifications
            WHERE operation_assignment_id = @assignmentId AND company_id = @companyId
          );
          DELETE FROM whatsapp_operation_assignment_notifications
          WHERE operation_assignment_id = @assignmentId AND company_id = @companyId;
          DELETE FROM operation_assignments
          WHERE id = @assignmentId AND company_id = @companyId;
        `);
    }
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  const insertAssignment = async (): Promise<string> => {
    const { getPool } = await import("../database/connection");
    const pool = getPool();
    const assignmentId = randomUUID();
    assignmentIds.push(assignmentId);
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, assignmentId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("workDate", sql.Date, workDate)
      .query(`
        INSERT INTO operation_assignments (
          id, company_id, operation_id, employee_id, valid_from, valid_until
        )
        VALUES (@id, @companyId, @operationId, @employeeId, @workDate, @workDate)
      `);
    return assignmentId;
  };

  it("A concurrent enqueue creates exactly one notification", async () => {
    const assignmentId = await insertAssignment();
    const [first, second] = await Promise.all([
      operationAssignmentNotificationRepository.enqueueAssigned(
        companyId,
        assignmentId,
        operationId,
        employeeId,
      ),
      operationAssignmentNotificationRepository.enqueueAssigned(
        companyId,
        assignmentId,
        operationId,
        employeeId,
      ),
    ]);
    assert.equal(first.id, second.id);

    const { getPool } = await import("../database/connection");
    const count = await getPool()
      .request()
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT COUNT(*) AS c
        FROM whatsapp_operation_assignment_notifications
        WHERE operation_assignment_id = @assignmentId AND company_id = @companyId
      `);
    assert.equal(Number(count.recordset[0].c), 1);
  });

  it("B two concurrent claims never return the same notification id", async () => {
    const a1 = await insertAssignment();
    const a2 = await insertAssignment();
    await operationAssignmentNotificationRepository.enqueueAssigned(
      companyId,
      a1,
      operationId,
      employeeId,
    );
    await operationAssignmentNotificationRepository.enqueueAssigned(
      companyId,
      a2,
      operationId,
      employeeId,
    );

    const [first, second] = await Promise.all([
      operationAssignmentNotificationRepository.claimNextOne(`w1-${randomUUID()}`, 60),
      operationAssignmentNotificationRepository.claimNextOne(`w2-${randomUUID()}`, 60),
    ]);

    assert.ok(Boolean(first) || Boolean(second));
    if (first && second) {
      assert.notEqual(first.id, second.id);
    }

    for (const row of [first, second]) {
      if (!row) continue;
      await operationAssignmentNotificationRepository.markCancelled({
        companyId,
        notificationId: row.id,
        errorCode: "TEST_CLEANUP",
        errorMessage: "concurrency test cleanup",
      });
    }
  });

  it("C expired PROCESSING lease recovers to PENDING without bumping attempt_count", async () => {
    const { getPool } = await import("../database/connection");
    const pool = getPool();
    const assignmentId = await insertAssignment();
    const notification = await operationAssignmentNotificationRepository.enqueueAssigned(
      companyId,
      assignmentId,
      operationId,
      employeeId,
    );

    await pool
      .request()
      .input("id", sql.UniqueIdentifier, notification.id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        UPDATE whatsapp_operation_assignment_notifications
        SET status = N'PROCESSING',
            lease_owner = N'stalled-worker',
            lease_expires_at = DATEADD(SECOND, -30, SYSUTCDATETIME()),
            attempt_count = 1,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId
      `);

    const recovered = await operationAssignmentNotificationRepository.recoverExpiredLeases(50);
    assert.ok(recovered >= 1);

    const after = await pool
      .request()
      .input("id", sql.UniqueIdentifier, notification.id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT attempt_count, status
        FROM whatsapp_operation_assignment_notifications
        WHERE id = @id AND company_id = @companyId
      `);
    assert.equal(Number(after.recordset[0].attempt_count), 1);
    assert.equal(String(after.recordset[0].status), "PENDING");
  });

  it("D expired SEND_STARTED lease → RECONCILIATION_REQUIRED", async () => {
    const { getPool } = await import("../database/connection");
    const pool = getPool();
    const assignmentId = await insertAssignment();
    const notification = await operationAssignmentNotificationRepository.enqueueAssigned(
      companyId,
      assignmentId,
      operationId,
      employeeId,
    );

    await pool
      .request()
      .input("id", sql.UniqueIdentifier, notification.id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        UPDATE whatsapp_operation_assignment_notifications
        SET status = N'SEND_STARTED',
            lease_owner = N'stalled-worker',
            lease_expires_at = DATEADD(SECOND, -30, SYSUTCDATETIME()),
            attempt_count = 1,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId
      `);

    await operationAssignmentNotificationRepository.recoverExpiredLeases(50);

    const after = await pool
      .request()
      .input("id", sql.UniqueIdentifier, notification.id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT status FROM whatsapp_operation_assignment_notifications
        WHERE id = @id AND company_id = @companyId
      `);
    assert.equal(String(after.recordset[0].status), "RECONCILIATION_REQUIRED");
  });

  it("E cancel race sets cancel_requested_at while PROCESSING", async () => {
    const assignmentId = await insertAssignment();
    const notification = await operationAssignmentNotificationRepository.enqueueAssigned(
      companyId,
      assignmentId,
      operationId,
      employeeId,
    );
    const claimed = await operationAssignmentNotificationRepository.claimNextOne(
      `cancel-race-${randomUUID()}`,
      120,
    );
    assert.ok(claimed);
    assert.equal(claimed!.id, notification.id);

    await operationAssignmentNotificationRepository.requestCancelForAssignment(
      companyId,
      assignmentId,
    );
    const cancelled = await operationAssignmentNotificationRepository.isCancelRequested(
      companyId,
      notification.id,
    );
    assert.equal(cancelled, true);
  });

  it("F unique send attempt rejects duplicate (notification_id, attempt_number)", async () => {
    const assignmentId = await insertAssignment();
    const notification = await operationAssignmentNotificationRepository.enqueueAssigned(
      companyId,
      assignmentId,
      operationId,
      employeeId,
    );
    const claimed = await operationAssignmentNotificationRepository.claimNextOne(
      `attempt-${randomUUID()}`,
      120,
    );
    assert.ok(claimed);

    const first = await operationAssignmentNotificationRepository.beginSendAttempt({
      companyId,
      notificationId: notification.id,
      leaseOwner: claimed!.leaseOwner!,
      attemptNumber: claimed!.attemptCount,
    });
    assert.ok(first);

    await assert.rejects(async () => {
      await operationAssignmentNotificationRepository.beginSendAttempt({
        companyId,
        notificationId: notification.id,
        leaseOwner: claimed!.leaseOwner!,
        attemptNumber: claimed!.attemptCount,
      });
    });
  });

  it("G callback correlates by provider_message_sid without whatsapp_messages row", async () => {
    const { getPool } = await import("../database/connection");
    const pool = getPool();
    const assignmentId = await insertAssignment();
    const notification = await operationAssignmentNotificationRepository.enqueueAssigned(
      companyId,
      assignmentId,
      operationId,
      employeeId,
    );
    const sid = `SM_TEST_${randomUUID().replace(/-/g, "").slice(0, 24)}`;

    await pool
      .request()
      .input("id", sql.UniqueIdentifier, notification.id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("sid", sql.NVarChar(100), sid)
      .query(`
        UPDATE whatsapp_operation_assignment_notifications
        SET status = N'SEND_ACCEPTED',
            provider_message_sid = @sid,
            sent_at = SYSUTCDATETIME(),
            lease_owner = NULL,
            lease_expires_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId
      `);

    await whatsappFlowTraceService.projectOutboxProviderStatusByMessageSid({
      providerMessageSid: sid,
      providerStatus: "delivered",
    });

    const after = await pool
      .request()
      .input("id", sql.UniqueIdentifier, notification.id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT provider_status
        FROM whatsapp_operation_assignment_notifications
        WHERE id = @id AND company_id = @companyId
      `);
    assert.equal(String(after.recordset[0].provider_status), "delivered");
  });
});
