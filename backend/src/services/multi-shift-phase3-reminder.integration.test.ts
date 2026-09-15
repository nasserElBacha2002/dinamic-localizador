/**
 * Phase 3 — reminder idempotency keyed by employee_workday on one MULTI_SHIFT operation.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  requireDinamicCompanyId,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { deleteOperationCascade } from "../test-helpers/integration-entity-cascade";
import { createDedicatedDatabaseConnection, getPool } from "../database/connection";
import { attendanceNotificationRepository } from "../repositories/attendance-notification.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { operationScheduleModeTransitionService } from "./operation-schedule-mode-transition.service";
import { operationAssignmentService } from "./operation-assignment.service";
import { recurringWorkdayMaterializationService } from "./recurring-workday-materialization.service";
import { getDateIsoInTimezone } from "../utils/absence-date";
import { resolveOperationTimezone } from "../utils/operation-timezone";

const NOTIFICATION_TYPE = "ARRIVAL_REMINDER_15_MIN" as const;

describeDatabaseIntegration("phase3 reminder idempotency by employee_workday (SQL)", () => {
  let companyId = "";
  let operationId = "";
  let employeeId = "";
  let morningShiftId = "";
  let afternoonShiftId = "";
  let ewMorning = "";
  let ewAfternoon = "";
  let owMorning = "";
  let owAfternoon = "";
  let workDate = "";
  let scheduleVersion = 1;

  before(async () => {
    await setupDatabaseIntegration();
    companyId = await requireDinamicCompanyId();
    const pool = getPool();

    const col = await pool.request().query(`
      SELECT COL_LENGTH(N'dbo.whatsapp_attendance_notifications', N'employee_workday_id') AS len
    `);
    assert.ok(col.recordset[0]?.len != null, "migration 132 employee_workday_id required");

    const uq = await pool.request().query(`
      SELECT 1 AS ok
      FROM sys.indexes
      WHERE name = N'UQ_whatsapp_attendance_notifications_ew_type_version'
        AND object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
    `);
    assert.ok(uq.recordset[0], "migration 132 EW UQ required");

    const settings = await companySettingsRepository.findByCompanyId(companyId);
    const timezone = resolveOperationTimezone(settings?.operationTimezone);
    workDate = getDateIsoInTimezone(new Date(), timezone);

    const employee = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id
        FROM dbo.employees
        WHERE company_id = @companyId
          AND active = 1
          AND phone_number IS NOT NULL
          AND LTRIM(RTRIM(phone_number)) <> N''
        ORDER BY created_at ASC
      `);
    employeeId = String(employee.recordset[0]?.id ?? "");
    assert.ok(employeeId, "active employee with phone required");

    const service = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id
        FROM dbo.operational_locations
        WHERE company_id = @companyId AND active = 1
        ORDER BY created_at ASC
      `);
    const serviceId = String(service.recordset[0]?.id ?? "");
    assert.ok(serviceId, "active operational_location required");

    const start = new Date(`${workDate}T12:00:00.000Z`);
    start.setUTCMilliseconds((Date.now() + Number.parseInt(randomUUID().slice(0, 8), 16)) % 86_400_000);
    const end = new Date(start.getTime() + 11 * 60 * 60 * 1000);
    const operation = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("start", sql.DateTime2, start)
      .input("end", sql.DateTime2, end)
      .query(`
        INSERT INTO dbo.scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes,
          early_tolerance_source, late_tolerance_source, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, N'ONE_TIME',
          @start, @end,
          30, 30, N'CUSTOM', N'CUSTOM', N'SCHEDULED'
        );
      `);
    operationId = String(operation.recordset[0].id);

    const transition = await operationScheduleModeTransitionService.transitionToMultiShift(
      companyId,
      operationId,
      {
        effectiveFrom: workDate,
        shifts: [
          {
            code: `M${randomUUID().slice(0, 6)}`,
            name: "Mañana",
            startTime: "09:00",
            endTime: "13:00",
          },
          {
            code: `T${randomUUID().slice(0, 6)}`,
            name: "Tarde",
            startTime: "14:00",
            endTime: "18:00",
          },
        ],
      },
    );
    assert.equal(transition.shiftIds.length, 2);

    await recurringWorkdayMaterializationService.materializeMultiShiftOperationHorizon(
      companyId,
      operationId,
      { rangeStart: workDate, rangeEnd: workDate },
    );

    const workdays = await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("workDate", sql.Date, workDate)
      .query(`
        SELECT id, operation_shift_id, schedule_version, expected_start_at
        FROM dbo.operation_workdays
        WHERE operation_id = @operationId AND work_date = @workDate
        ORDER BY expected_start_at ASC
      `);
    assert.equal(workdays.recordset.length, 2, "both shift workdays must materialize");
    owMorning = String(workdays.recordset[0].id);
    owAfternoon = String(workdays.recordset[1].id);
    morningShiftId = String(workdays.recordset[0].operation_shift_id);
    afternoonShiftId = String(workdays.recordset[1].operation_shift_id);
    scheduleVersion = Number(workdays.recordset[0].schedule_version ?? 1);
    assert.ok(morningShiftId && afternoonShiftId);
    assert.notEqual(morningShiftId, afternoonShiftId);

    await operationAssignmentService.assignEmployee(companyId, operationId, employeeId, {
      operationShiftId: morningShiftId,
    });
    await operationAssignmentService.assignEmployee(companyId, operationId, employeeId, {
      operationShiftId: afternoonShiftId,
    });

    const ews = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("owMorning", sql.UniqueIdentifier, owMorning)
      .input("owAfternoon", sql.UniqueIdentifier, owAfternoon)
      .query(`
        SELECT id, operation_workday_id
        FROM dbo.employee_workdays
        WHERE company_id = @companyId
          AND employee_id = @employeeId
          AND operation_workday_id IN (@owMorning, @owAfternoon)
          AND expectation_status = N'EXPECTED'
      `);
    assert.equal(ews.recordset.length, 2, "same employee must have EW on both shifts");
    for (const row of ews.recordset) {
      if (String(row.operation_workday_id) === owMorning) {
        ewMorning = String(row.id);
      } else {
        ewAfternoon = String(row.id);
      }
    }
    assert.ok(ewMorning && ewAfternoon);
    assert.notEqual(ewMorning, ewAfternoon);
  });

  after(async () => {
    if (operationId && companyId) {
      try {
        await deleteOperationCascade(companyId, operationId);
      } catch (error) {
        console.warn("[phase3-reminder] cleanup failed", operationId, error);
      }
    }
    await teardownDatabaseIntegration();
  });

  const claim = (employeeWorkdayId: string) =>
    attendanceNotificationRepository.claimNotificationForAttempt(companyId, {
      operationId,
      employeeId,
      notificationType: NOTIFICATION_TYPE,
      scheduleVersion,
      employeeWorkdayId,
    });

  const listNotifications = async () => {
    const pool = getPool();
    const result = await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("type", sql.NVarChar(40), NOTIFICATION_TYPE)
      .input("version", sql.Int, scheduleVersion)
      .query(`
        SELECT id, employee_workday_id, attempt_count, status, schedule_version
        FROM dbo.whatsapp_attendance_notifications
        WHERE operation_id = @operationId
          AND employee_id = @employeeId
          AND notification_type = @type
          AND schedule_version = @version
        ORDER BY employee_workday_id
      `);
    return result.recordset as Array<{
      id: string;
      employee_workday_id: string;
      attempt_count: number;
      status: string;
      schedule_version: number;
    }>;
  };

  it("claims both EWs independently: 2 rows, shared keys, distinct EW, reclaim morning leaves afternoon", async () => {
    const morning = await claim(ewMorning);
    const afternoon = await claim(ewAfternoon);
    assert.ok(morning);
    assert.ok(afternoon);
    assert.notEqual(morning!.id, afternoon!.id);
    assert.equal(morning!.attemptCount, 1);
    assert.equal(afternoon!.attemptCount, 1);

    const rows = await listNotifications();
    assert.equal(rows.length, 2);
    const ewIds = new Set(rows.map((r) => String(r.employee_workday_id)));
    assert.equal(ewIds.size, 2);
    assert.ok(ewIds.has(ewMorning));
    assert.ok(ewIds.has(ewAfternoon));
    assert.ok(rows.every((r) => Number(r.schedule_version) === scheduleVersion));

    const afternoonBefore = rows.find((r) => String(r.employee_workday_id) === ewAfternoon)!;
    const morningAgain = await claim(ewMorning);
    assert.equal(morningAgain, null);

    const afterReclaim = await listNotifications();
    assert.equal(afterReclaim.length, 2);
    const afternoonAfter = afterReclaim.find(
      (r) => String(r.employee_workday_id) === ewAfternoon,
    )!;
    assert.equal(String(afternoonAfter.id), String(afternoonBefore.id));
    assert.equal(Number(afternoonAfter.attempt_count), Number(afternoonBefore.attempt_count));

    const pool = getPool();
    const owStarts = await pool
      .request()
      .input("owMorning", sql.UniqueIdentifier, owMorning)
      .input("owAfternoon", sql.UniqueIdentifier, owAfternoon)
      .query(`
        SELECT id, expected_start_at
        FROM dbo.operation_workdays
        WHERE id IN (@owMorning, @owAfternoon)
      `);
    const startByOw = new Map(
      owStarts.recordset.map((r: { id: string; expected_start_at: Date }) => [
        String(r.id),
        new Date(r.expected_start_at),
      ]),
    );
    const windowStart = new Date(
      Math.min(
        startByOw.get(owMorning)!.getTime(),
        startByOw.get(owAfternoon)!.getTime(),
      ) - 60_000,
    );
    const windowEnd = new Date(
      Math.max(
        startByOw.get(owMorning)!.getTime(),
        startByOw.get(owAfternoon)!.getTime(),
      ) + 60_000,
    );

    // Clear notifications so candidates are eligible again for the join query.
    await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        DELETE FROM dbo.whatsapp_attendance_notifications WHERE operation_id = @operationId
      `);

    const candidates = await attendanceNotificationRepository.findArrivalReminderCandidates(
      companyId,
      { windowStart, windowEnd },
    );
    const forOp = candidates.filter((c) => c.operationId === operationId && c.employeeId === employeeId);
    assert.equal(forOp.length, 2, "join must not cartesian-duplicate multi-shift EWs");
    const candidateEws = new Set(forOp.map((c) => c.employeeWorkdayId));
    assert.equal(candidateEws.size, 2);
    assert.ok(candidateEws.has(ewMorning));
    assert.ok(candidateEws.has(ewAfternoon));
  });

  it("concurrent same EW+type+version: exactly one sendable claim", async () => {
    const pool = getPool();
    await pool
      .request()
      .input("ewId", sql.UniqueIdentifier, ewMorning)
      .input("type", sql.NVarChar(40), NOTIFICATION_TYPE)
      .input("version", sql.Int, scheduleVersion)
      .query(`
        DELETE FROM dbo.whatsapp_attendance_notifications
        WHERE employee_workday_id = @ewId
          AND notification_type = @type
          AND schedule_version = @version
      `);

    const dedicatedA = await createDedicatedDatabaseConnection();
    const dedicatedB = await createDedicatedDatabaseConnection();

    const raceInsert = async (dedicated: sql.ConnectionPool): Promise<"inserted" | "duplicate"> => {
      try {
        await dedicated
          .request()
          .input("companyId", sql.UniqueIdentifier, companyId)
          .input("operationId", sql.UniqueIdentifier, operationId)
          .input("employeeId", sql.UniqueIdentifier, employeeId)
          .input("employeeWorkdayId", sql.UniqueIdentifier, ewMorning)
          .input("notificationType", sql.NVarChar(40), NOTIFICATION_TYPE)
          .input("scheduleVersion", sql.Int, scheduleVersion)
          .query(`
            INSERT INTO whatsapp_attendance_notifications (
              company_id, operation_id, employee_id, employee_workday_id,
              notification_type, status, attempt_count, schedule_version, reminder_source
            )
            VALUES (
              @companyId, @operationId, @employeeId, @employeeWorkdayId,
              @notificationType, 'PENDING', 0, @scheduleVersion, N'AUTOMATIC'
            )
          `);
        return "inserted";
      } catch (error) {
        const number =
          error && typeof error === "object" && "number" in error
            ? Number((error as { number?: number }).number)
            : 0;
        if (number === 2601 || number === 2627) {
          return "duplicate";
        }
        throw error;
      }
    };

    try {
      const [a, b] = await Promise.all([raceInsert(dedicatedA), raceInsert(dedicatedB)]);
      assert.equal([a, b].filter((r) => r === "inserted").length, 1);
      assert.equal([a, b].filter((r) => r === "duplicate").length, 1);

      const rows = await pool
        .request()
        .input("ewId", sql.UniqueIdentifier, ewMorning)
        .input("type", sql.NVarChar(40), NOTIFICATION_TYPE)
        .input("version", sql.Int, scheduleVersion)
        .query(`
          SELECT id FROM dbo.whatsapp_attendance_notifications
          WHERE employee_workday_id = @ewId
            AND notification_type = @type
            AND schedule_version = @version
        `);
      assert.equal(rows.recordset.length, 1);

      const notificationId = String(rows.recordset[0].id);
      const attemptedAt = new Date();
      const [claimA, claimB] = await Promise.all([
        attendanceNotificationRepository.beginAttempt(companyId, {
          notificationId,
          attemptedAt,
          firstAttemptOnly: true,
        }),
        attendanceNotificationRepository.beginAttempt(companyId, {
          notificationId,
          attemptedAt,
          firstAttemptOnly: true,
        }),
      ]);
      const sendable = [claimA, claimB].filter((row) => row != null);
      assert.equal(sendable.length, 1, "exactly one beginAttempt must authorize send");
      assert.ok([claimA, claimB].some((row) => row == null));
      assert.equal(sendable[0]!.attemptCount, 1);
    } finally {
      await dedicatedA.close();
      await dedicatedB.close();
    }

    await pool
      .request()
      .input("ewId", sql.UniqueIdentifier, ewAfternoon)
      .input("type", sql.NVarChar(40), NOTIFICATION_TYPE)
      .input("version", sql.Int, scheduleVersion)
      .query(`
        DELETE FROM dbo.whatsapp_attendance_notifications
        WHERE employee_workday_id = @ewId
          AND notification_type = @type
          AND schedule_version = @version
      `);

    const parallel = await Promise.all([claim(ewAfternoon), claim(ewAfternoon)]);
    const accepted = parallel.filter(Boolean);
    assert.equal(accepted.length, 1);
    const afternoonRows = await pool
      .request()
      .input("ewId", sql.UniqueIdentifier, ewAfternoon)
      .input("type", sql.NVarChar(40), NOTIFICATION_TYPE)
      .input("version", sql.Int, scheduleVersion)
      .query(`
        SELECT COUNT(*) AS total, MAX(attempt_count) AS max_attempts
        FROM dbo.whatsapp_attendance_notifications
        WHERE employee_workday_id = @ewId
          AND notification_type = @type
          AND schedule_version = @version
      `);
    assert.equal(Number(afternoonRows.recordset[0].total), 1);
    assert.equal(Number(afternoonRows.recordset[0].max_attempts), 1);
  });

  it("concurrent different EWs (morning vs afternoon): both accepted", async () => {
    const pool = getPool();
    await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        DELETE FROM dbo.whatsapp_attendance_notifications WHERE operation_id = @operationId
      `);

    const [morning, afternoon] = await Promise.all([claim(ewMorning), claim(ewAfternoon)]);
    assert.ok(morning);
    assert.ok(afternoon);
    assert.notEqual(morning!.id, afternoon!.id);

    const rows = await listNotifications();
    assert.equal(rows.length, 2);
    assert.equal(new Set(rows.map((r) => String(r.employee_workday_id))).size, 2);
  });
});
