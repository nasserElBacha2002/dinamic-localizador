import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import sql from "mssql";
import { getPool } from "../../database/connection";
import {
  combineAttendanceValidation,
  evaluateGeofence,
  evaluatePunctuality,
} from "../../utils/attendance-validation";
import { normalizeWorkTeamName } from "../../utils/work-team-name";
import { randomPointWithinRadius } from "./geo";
import {
  batchMarkerSqlLike,
  buildBatchMarker,
  buildOperationNotes,
  isCycleIntegrationName,
} from "./markers";
import { createSeedRandom } from "./random";
import type { HistoricalSeedPlan, SeedEmployee, SeedService } from "./types";

export interface CatalogLoadResult {
  employees: SeedEmployee[];
  excludedCycleIntegration: number;
  services: SeedService[];
  companyName: string;
  timezone: string;
}

export const loadSeedCatalog = async (companyId: string): Promise<CatalogLoadResult> => {
  const pool = getPool();
  const company = await pool
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .query(`
      SELECT c.name AS company_name, cs.operation_timezone
      FROM companies c
      LEFT JOIN company_settings cs ON cs.company_id = c.id
      WHERE c.id = @companyId AND c.status = N'ACTIVE'
    `);
  if (!company.recordset[0]) {
    throw new Error(`Company not found or inactive: ${companyId}`);
  }

  const employeesResult = await pool
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .query(`
      SELECT id, name
      FROM employees
      WHERE company_id = @companyId AND active = 1
      ORDER BY id
    `);

  let excludedCycleIntegration = 0;
  const employees: SeedEmployee[] = [];
  for (const row of employeesResult.recordset as Array<{ id: string; name: string }>) {
    if (isCycleIntegrationName(row.name)) {
      excludedCycleIntegration += 1;
      continue;
    }
    employees.push({ id: String(row.id), name: String(row.name) });
  }

  const servicesResult = await pool
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .query(`
      SELECT id, name, latitude, longitude, allowed_radius_meters, location_zone_id
      FROM operational_locations
      WHERE company_id = @companyId AND active = 1
      ORDER BY id
    `);

  const services: SeedService[] = (
    servicesResult.recordset as Array<Record<string, unknown>>
  ).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    allowedRadiusMeters: Number(row.allowed_radius_meters),
    locationZoneId: row.location_zone_id ? String(row.location_zone_id) : null,
  }));

  const timezone =
    company.recordset[0].operation_timezone
      ? String(company.recordset[0].operation_timezone)
      : "America/Argentina/Buenos_Aires";

  return {
    employees,
    excludedCycleIntegration,
    services,
    companyName: String(company.recordset[0].company_name),
    timezone,
  };
};

export const assertBatchNotExists = async (
  companyId: string,
  batchId: string,
): Promise<void> => {
  const pool = getPool();
  const marker = batchMarkerSqlLike(batchId);
  const result = await pool
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("marker", sql.NVarChar(200), marker)
    .query(`
      SELECT TOP 1 id
      FROM scheduled_operations
      WHERE company_id = @companyId AND notes LIKE @marker
    `);
  if (result.recordset[0]) {
    throw new Error(
      `Batch ${batchId} already has seeded operations. Run --cleanup ${batchId} first.`,
    );
  }
};

const normalizeTeamName = (name: string): string => normalizeWorkTeamName(name);

export interface ExecuteSeedResult {
  operationsCreated: number;
  workdaysCreated: number;
  assignmentsCreated: number;
  employeeWorkdaysCreated: number;
  attendanceCreated: number;
  workTeamsCreated: number;
}

/**
 * Executes one planned operation atomically (operation + workday + assignments +
 * employee_workdays + attendance). Does not call assignment services (no WhatsApp).
 */
export const executeHistoricalSeed = async (
  plan: HistoricalSeedPlan,
  catalog: CatalogLoadResult,
): Promise<ExecuteSeedResult> => {
  const pool = getPool();
  const serviceById = new Map(catalog.services.map((s) => [s.id, s]));
  const rng = createSeedRandom(plan.seed ^ 0xA11CE);

  const workTeamIds: string[] = [];
  for (const team of plan.workTeams) {
    const normalizedName = normalizeTeamName(team.name);
    const created = await pool
      .request()
      .input("id", sql.UniqueIdentifier, randomUUID())
      .input("companyId", sql.UniqueIdentifier, plan.companyId)
      .input("name", sql.NVarChar(150), team.name)
      .input("normalizedName", sql.NVarChar(150), normalizedName)
      .input("description", sql.NVarChar(500), team.description)
      .query(`
        INSERT INTO work_teams (id, company_id, name, normalized_name, description, is_active)
        OUTPUT INSERTED.id
        VALUES (@id, @companyId, @name, @normalizedName, @description, 1)
      `);
    const teamId = String(created.recordset[0].id);
    workTeamIds.push(teamId);
    for (const employeeId of team.employeeIds) {
      await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, plan.companyId)
        .input("workTeamId", sql.UniqueIdentifier, teamId)
        .input("employeeId", sql.UniqueIdentifier, employeeId)
        .query(`
          INSERT INTO work_team_members (company_id, work_team_id, employee_id)
          VALUES (@companyId, @workTeamId, @employeeId)
        `);
    }
  }

  let operationsCreated = 0;
  let workdaysCreated = 0;
  let assignmentsCreated = 0;
  let employeeWorkdaysCreated = 0;
  let attendanceCreated = 0;

  for (const op of plan.operations) {
    const service = serviceById.get(op.serviceId);
    if (!service) {
      throw new Error(`Service missing from catalog: ${op.serviceId}`);
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const startLocal = DateTime.fromISO(op.workDate, { zone: plan.timezone }).set({
        hour: op.startHour,
        minute: 0,
        second: 0,
        millisecond: 0,
      });
      const endLocal = startLocal.plus({ hours: op.durationHours });
      const scheduledStart = startLocal.toUTC().toJSDate();
      const scheduledEnd = endLocal.toUTC().toJSDate();
      const notes = buildOperationNotes(plan.batchId, op.label);

      const opResult = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, plan.companyId)
        .input("serviceId", sql.UniqueIdentifier, op.serviceId)
        .input("scheduledStart", sql.DateTime2, scheduledStart)
        .input("scheduledEnd", sql.DateTime2, scheduledEnd)
        .input("notes", sql.NVarChar(1000), notes)
        .query(`
          INSERT INTO scheduled_operations (
            company_id, service_id, scheduled_start, scheduled_end,
            early_tolerance_minutes, late_tolerance_minutes,
            status, operation_kind, notes
          )
          OUTPUT INSERTED.id
          VALUES (
            @companyId, @serviceId, @scheduledStart, @scheduledEnd,
            60, 90, N'COMPLETED', N'ONE_TIME', @notes
          )
        `);
      const operationId = String(opResult.recordset[0].id);
      operationsCreated += 1;

      const wdResult = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, plan.companyId)
        .input("operationId", sql.UniqueIdentifier, operationId)
        .input("workDate", sql.Date, op.workDate)
        .input("expectedStart", sql.DateTime2, scheduledStart)
        .input("expectedEnd", sql.DateTime2, scheduledEnd)
        .query(`
          INSERT INTO operation_workdays (
            company_id, operation_id, work_date, expected_start_at, expected_end_at,
            early_tolerance_minutes, late_tolerance_minutes, schedule_version, status
          )
          OUTPUT INSERTED.id
          VALUES (
            @companyId, @operationId, @workDate, @expectedStart, @expectedEnd,
            60, 90, 1, N'ACTIVE'
          )
        `);
      const workdayId = String(wdResult.recordset[0].id);
      workdaysCreated += 1;

      const sourceWorkTeamId =
        op.mode === "work_team" && op.workTeamIndex !== null
          ? workTeamIds[op.workTeamIndex] ?? null
          : null;

      for (const assignment of op.assignments) {
        const asgResult = await new sql.Request(transaction)
          .input("assignmentId", sql.UniqueIdentifier, randomUUID())
          .input("companyId", sql.UniqueIdentifier, plan.companyId)
          .input("operationId", sql.UniqueIdentifier, operationId)
          .input("employeeId", sql.UniqueIdentifier, assignment.employeeId)
          .input("validFrom", sql.Date, op.workDate)
          .input("validUntil", sql.Date, op.workDate)
          .input("origin", sql.NVarChar(20), op.mode === "work_team" ? "WORK_TEAM" : "MANUAL")
          .input("sourceWorkTeamId", sql.UniqueIdentifier, sourceWorkTeamId)
          .query(`
            INSERT INTO operation_assignments (
              id, company_id, operation_id, employee_id, valid_from, valid_until,
              confirmation_status, assignment_origin, source_work_team_id
            )
            OUTPUT INSERTED.id
            VALUES (
              @assignmentId, @companyId, @operationId, @employeeId, @validFrom, @validUntil,
              N'CONFIRMED', @origin, @sourceWorkTeamId
            )
          `);
        const assignmentId = String(asgResult.recordset[0].id);
        assignmentsCreated += 1;

        const ewResult = await new sql.Request(transaction)
          .input("companyId", sql.UniqueIdentifier, plan.companyId)
          .input("workdayId", sql.UniqueIdentifier, workdayId)
          .input("employeeId", sql.UniqueIdentifier, assignment.employeeId)
          .input("assignmentId", sql.UniqueIdentifier, assignmentId)
          .query(`
            INSERT INTO employee_workdays (
              company_id, operation_workday_id, employee_id,
              expectation_status, operation_assignment_id
            )
            OUTPUT INSERTED.id
            VALUES (
              @companyId, @workdayId, @employeeId, N'EXPECTED', @assignmentId
            )
          `);
        const employeeWorkdayId = String(ewResult.recordset[0].id);
        employeeWorkdaysCreated += 1;

        if (assignment.attendance === "none") {
          continue;
        }

        const point = randomPointWithinRadius(
          service.latitude,
          service.longitude,
          service.allowedRadiusMeters,
          () => rng.next(),
        );
        const geo = evaluateGeofence(point.distanceMeters, service.allowedRadiusMeters, 30);
        const receivedAt =
          assignment.attendance === "late"
            ? new Date(scheduledStart.getTime() + 70 * 60 * 1000)
            : new Date(scheduledStart.getTime() + 5 * 60 * 1000);
        const punctuality = evaluatePunctuality(receivedAt, scheduledStart, 60, 90, 15);
        const combined = combineAttendanceValidation(geo, punctuality);

        await new sql.Request(transaction)
          .input("companyId", sql.UniqueIdentifier, plan.companyId)
          .input("operationId", sql.UniqueIdentifier, operationId)
          .input("employeeId", sql.UniqueIdentifier, assignment.employeeId)
          .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
          .input("lat", sql.Decimal(10, 7), point.latitude)
          .input("lon", sql.Decimal(10, 7), point.longitude)
          .input("distance", sql.Decimal(10, 2), point.distanceMeters)
          .input("validationStatus", sql.NVarChar(30), combined.validationStatus)
          .input("locationStatus", sql.NVarChar(30), combined.locationStatus)
          .input("punctualityStatus", sql.NVarChar(30), combined.punctualityStatus)
          .input("reason", sql.NVarChar(500), combined.validationReason)
          .input("receivedAt", sql.DateTime2, receivedAt)
          .query(`
            INSERT INTO attendance_records (
              company_id, operation_id, employee_id, employee_workday_id,
              received_latitude, received_longitude, distance_meters,
              validation_status, location_status, punctuality_status,
              source_message_sid, validation_reason, received_at
            )
            VALUES (
              @companyId, @operationId, @employeeId, @employeeWorkdayId,
              @lat, @lon, @distance,
              @validationStatus, @locationStatus, @punctualityStatus,
              NULL, @reason, @receivedAt
            )
          `);
        attendanceCreated += 1;
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  return {
    operationsCreated,
    workdaysCreated,
    assignmentsCreated,
    employeeWorkdaysCreated,
    attendanceCreated,
    workTeamsCreated: workTeamIds.length,
  };
};

export const countSeededByBatch = async (
  companyId: string,
  batchId: string,
): Promise<{
  operations: number;
  workTeams: number;
  marker: string;
}> => {
  const pool = getPool();
  const marker = batchMarkerSqlLike(batchId);
  const ops = await pool
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("marker", sql.NVarChar(200), marker)
    .query(`
      SELECT COUNT(*) AS cnt
      FROM scheduled_operations
      WHERE company_id = @companyId AND notes LIKE @marker
    `);
  const teams = await pool
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("marker", sql.NVarChar(200), marker)
    .query(`
      SELECT COUNT(*) AS cnt
      FROM work_teams
      WHERE company_id = @companyId AND description LIKE @marker
    `);
  return {
    operations: Number(ops.recordset[0].cnt),
    workTeams: Number(teams.recordset[0].cnt),
    marker: buildBatchMarker(batchId),
  };
};
