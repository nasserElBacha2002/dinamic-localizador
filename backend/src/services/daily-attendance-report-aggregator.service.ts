import sql from "mssql";
import { getPool } from "../database/connection";
import type {
  DailyAttendanceReportIncident,
  DailyAttendanceReportOperationBreakdown,
  DailyAttendanceReportPayload,
  DailyAttendanceReportTotals,
  DailyAttendanceReportWorkday,
} from "../types/daily-attendance-report";
import { classifyDailyAttendanceReportRow } from "../utils/daily-attendance-report-classify";
import { CANONICAL_PRODUCTION_ATTENDANCE_APPLY } from "../utils/statistics-canonical-attendance";
import { EFFECTIVE_STATE_SQL, WORKED_MINUTES_SQL, OVERTIME_MINUTES_SQL } from "../utils/employee-workday-statistics-projection";
import { toDateOnlyString } from "../utils/row-mappers";

const MAX_INCIDENTS = 40;

type Row = {
  operation_id: string;
  operation_workday_id: string;
  operation_shift_id: string | null;
  shift_name_snapshot: string | null;
  work_date: Date | string;
  service_name: string;
  expected_start_at: Date | string;
  expected_end_at: Date | string | null;
  late_tolerance_minutes: number;
  employee_workday_id: string;
  employee_name: string;
  expectation_status: string;
  confirmation_status: string | null;
  received_at: Date | string | null;
  checkout_at: Date | string | null;
  punctuality_status: string | null;
  validation_status: string | null;
  location_status: string | null;
  checkout_status: string | null;
  extra_worked_minutes: number;
  effective_state: string;
  worked_minutes: number;
  overtime_minutes: number;
  company_name: string;
};

const toDate = (value: Date | string | null | undefined): Date | null => {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
};

/**
 * Aggregates attendance for a company civil report_date (operation_workdays.work_date).
 *
 * Classification uses evaluatedAt (generation instant), not local midnight:
 * - missing check-in: EXPECTED, start+lateTolerance <= evaluatedAt, no operational arrival
 * - missing checkout: has arrival, expectedEnd+earlyLeaveTolerance <= evaluatedAt, no checkout
 * - incomplete: checkout window still open at evaluatedAt
 *
 * Canonical sources:
 * - JUSTIFIED: employee_workdays.expectation_status (absence reconciliation / UI / WhatsApp)
 * - UNAVAILABLE / PENDING confirmation: operation_assignments.confirmation_status
 * - Attendance: CANONICAL_PRODUCTION_ATTENDANCE_APPLY (VALID preferred over PENDING_REVIEW)
 *
 * Denominator: expectation not CANCELLED. Cancelled operation_workdays excluded.
 */
export const dailyAttendanceReportAggregator = {
  async buildReport(input: {
    companyId: string;
    reportDate: string;
    timezoneId: string;
    earlyLeaveToleranceMinutes: number;
    evaluatedAt: Date;
  }): Promise<DailyAttendanceReportPayload> {
    const evaluatedAt = input.evaluatedAt;
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("reportDate", sql.Date, input.reportDate)
      .query(`
        SELECT
          c.name AS company_name,
          ow.operation_id,
          ow.id AS operation_workday_id,
          ow.operation_shift_id,
          ow.shift_name_snapshot,
          ow.work_date,
          s.name AS service_name,
          ow.expected_start_at,
          ow.expected_end_at,
          ow.late_tolerance_minutes,
          ew.id AS employee_workday_id,
          e.name AS employee_name,
          ew.expectation_status,
          oa.confirmation_status,
          ar.received_at,
          ar.checkout_at,
          ar.punctuality_status,
          ar.validation_status,
          ar.location_status,
          ar.checkout_status,
          ar.extra_worked_minutes,
          ${EFFECTIVE_STATE_SQL} AS effective_state,
          ${WORKED_MINUTES_SQL} AS worked_minutes,
          ${OVERTIME_MINUTES_SQL} AS overtime_minutes
        FROM operation_workdays ow
        INNER JOIN companies c ON c.id = ow.company_id
        INNER JOIN scheduled_operations i
          ON i.id = ow.operation_id AND i.company_id = ow.company_id
        INNER JOIN operational_locations s
          ON s.id = i.service_id AND s.company_id = ow.company_id
        INNER JOIN employee_workdays ew
          ON ew.operation_workday_id = ow.id AND ew.company_id = ow.company_id
        INNER JOIN employees e
          ON e.id = ew.employee_id AND e.company_id = ow.company_id
        LEFT JOIN operation_assignments oa
          ON oa.id = ew.operation_assignment_id AND oa.company_id = ew.company_id
        ${CANONICAL_PRODUCTION_ATTENDANCE_APPLY}
        WHERE ow.company_id = @companyId
          AND ow.work_date = @reportDate
          AND ow.status = N'ACTIVE'
          AND ew.expectation_status <> N'CANCELLED'
        ORDER BY s.name ASC, ow.expected_start_at ASC, e.name ASC
      `);

    const rows = result.recordset as Row[];
  const companyName = rows[0] ? String(rows[0].company_name) : "";
    if (rows.length === 0) {
      return {
        companyId: input.companyId,
        companyName,
        reportDate: input.reportDate,
        timezoneId: input.timezoneId,
        evaluatedAtIso: evaluatedAt.toISOString(),
        totals: {
          scheduledWorkdays: 0, presentWorkdays: 0, absentWorkdays: 0, justifiedWorkdays: 0,
          confirmedButAbsentWorkdays: 0, unannouncedAbsenceWorkdays: 0, pendingReviewAttendances: 0, rejectedAttendances: 0, outsideGeofenceAttendances: 0, workedMinutes: 0, extraWorkedMinutes: 0,
          operationsCount: 0,
          scheduledEmployeesCount: 0,
          presentCount: 0,
          checkinCount: 0,
          checkoutCount: 0,
          lateCount: 0,
          earlyLeaveCount: 0,
          unavailableCount: 0,
          justifiedCount: 0,
          pendingConfirmationCount: 0,
          missingCheckinCount: 0,
          missingCheckoutCount: 0,
          incompleteCount: 0,
        },
        operations: [],
        incidents: [],
        totalIncidentCount: 0,
        hasActivity: false,
        workdays: [],
      };
    }

    const byOw = new Map<string, DailyAttendanceReportOperationBreakdown>();
    const incidents: DailyAttendanceReportIncident[] = [];
    const workdays: DailyAttendanceReportWorkday[] = [];
    let totalIncidentCount = 0;
    const totals: DailyAttendanceReportTotals = {
      scheduledWorkdays: 0, presentWorkdays: 0, absentWorkdays: 0, justifiedWorkdays: 0,
      confirmedButAbsentWorkdays: 0, unannouncedAbsenceWorkdays: 0, pendingReviewAttendances: 0, rejectedAttendances: 0, outsideGeofenceAttendances: 0, workedMinutes: 0, extraWorkedMinutes: 0,
      operationsCount: 0,
      scheduledEmployeesCount: 0,
      presentCount: 0,
      checkinCount: 0,
      checkoutCount: 0,
      lateCount: 0,
      earlyLeaveCount: 0,
      unavailableCount: 0,
      justifiedCount: 0,
      pendingConfirmationCount: 0,
      missingCheckinCount: 0,
      missingCheckoutCount: 0,
      incompleteCount: 0,
    };

    for (const row of rows) {
      const owId = String(row.operation_workday_id);
      if (!byOw.has(owId)) {
        byOw.set(owId, {
          operationId: String(row.operation_id),
          operationWorkdayId: owId,
          workDate: toDateOnlyString(row.work_date),
          serviceName: String(row.service_name),
          expectedStartAt: toDate(row.expected_start_at)!.toISOString(),
          expectedEndAt: toDate(row.expected_end_at)?.toISOString() ?? null,
          scheduledEmployees: 0,
          present: 0,
          missingCheckin: 0,
          missingCheckout: 0,
          late: 0,
          earlyLeave: 0,
          unavailable: 0,
          justified: 0,
          pendingConfirmation: 0,
          incomplete: 0,
        });
      }
      const op = byOw.get(owId)!;
      op.scheduledEmployees += 1;
      totals.scheduledEmployeesCount += 1;

      const classified = classifyDailyAttendanceReportRow({
        expectationStatus: String(row.expectation_status),
        confirmationStatus: row.confirmation_status,
        punctualityStatus: row.punctuality_status,
        validationStatus: row.validation_status,
        expectedStartAt: toDate(row.expected_start_at)!,
        expectedEndAt: toDate(row.expected_end_at),
        receivedAt: toDate(row.received_at),
        checkoutAt: toDate(row.checkout_at),
        lateToleranceMinutes: Number(row.late_tolerance_minutes ?? 0),
        earlyLeaveToleranceMinutes: input.earlyLeaveToleranceMinutes,
        evaluatedAt,
      });

      workdays.push({
        employeeWorkdayId: String(row.employee_workday_id), employeeName: String(row.employee_name),
        serviceName: String(row.service_name), operationId: String(row.operation_id),
        operationWorkdayId: owId, expectedStartAt: toDate(row.expected_start_at)!.toISOString(),
        expectedEndAt: toDate(row.expected_end_at)?.toISOString() ?? null,
        receivedAt: toDate(row.received_at)?.toISOString() ?? null,
        checkoutAt: toDate(row.checkout_at)?.toISOString() ?? null,
        expectationStatus: String(row.expectation_status), confirmationStatus: row.confirmation_status,
        punctualityStatus: row.punctuality_status, validationStatus: row.validation_status,
        state: String(row.effective_state),
        late: classified.late, earlyLeave: classified.earlyLeave, missingCheckin: classified.missingCheckin,
        missingCheckout: classified.missingCheckout, unavailable: classified.unavailable,
        justified: classified.justified, present: classified.present, incomplete: classified.incomplete,
        operationShiftId: row.operation_shift_id, shiftNameSnapshot: row.shift_name_snapshot,
        locationStatus: row.location_status, checkoutStatus: row.checkout_status,
        workedMinutes: Number(row.worked_minutes ?? 0), extraWorkedMinutes: Number(row.overtime_minutes ?? 0),
        confirmedButAbsent: row.effective_state === "ABSENT" && row.confirmation_status === "CONFIRMED",
        unannouncedAbsence: row.effective_state === "ABSENT" && row.confirmation_status !== "UNAVAILABLE" && String(row.expectation_status) !== "JUSTIFIED",
        pendingReview: row.validation_status === "PENDING_REVIEW", rejectedAttendance: row.validation_status === "REJECTED", outsideGeofence: row.location_status === "OUTSIDE_GEOFENCE",
      });
      totals.scheduledWorkdays += 1;
      if (classified.justified) totals.justifiedWorkdays += 1;
      if (classified.present) totals.presentWorkdays += 1;
      if (row.effective_state === "ABSENT") totals.absentWorkdays += 1;
      totals.workedMinutes += Number(row.worked_minutes ?? 0);
      totals.extraWorkedMinutes += Number(row.overtime_minutes ?? 0);
      const finalAbsent = row.effective_state === "ABSENT";
      if (finalAbsent && row.confirmation_status === "CONFIRMED") { totals.confirmedButAbsentWorkdays += 1; pushIncident(incidents, { kind: "CONFIRMED_BUT_ABSENT", employeeName: String(row.employee_name), serviceName: String(row.service_name), operationId: String(row.operation_id), detail: "Confirmó asistencia pero faltó", employeeWorkdayId: String(row.employee_workday_id) }); totalIncidentCount += 1; }
      if (finalAbsent && row.confirmation_status !== "UNAVAILABLE" && String(row.expectation_status) !== "JUSTIFIED") { totals.unannouncedAbsenceWorkdays += 1; pushIncident(incidents, { kind: "UNANNOUNCED_ABSENCE", employeeName: String(row.employee_name), serviceName: String(row.service_name), operationId: String(row.operation_id), detail: "Falta sin aviso", employeeWorkdayId: String(row.employee_workday_id) }); totalIncidentCount += 1; }
      if (row.validation_status === "PENDING_REVIEW") { totals.pendingReviewAttendances += 1; pushIncident(incidents, { kind: "PENDING_REVIEW", employeeName: String(row.employee_name), serviceName: String(row.service_name), operationId: String(row.operation_id), detail: "Pendiente de revisión", employeeWorkdayId: String(row.employee_workday_id) }); totalIncidentCount += 1; }
      if (row.validation_status === "REJECTED") { totals.rejectedAttendances += 1; pushIncident(incidents, { kind: "REJECTED_ATTENDANCE", employeeName: String(row.employee_name), serviceName: String(row.service_name), operationId: String(row.operation_id), detail: "Asistencia rechazada", employeeWorkdayId: String(row.employee_workday_id) }); totalIncidentCount += 1; }
      if (row.location_status === "OUTSIDE_GEOFENCE") { totals.outsideGeofenceAttendances += 1; pushIncident(incidents, { kind: "OUTSIDE_GEOFENCE", employeeName: String(row.employee_name), serviceName: String(row.service_name), operationId: String(row.operation_id), detail: "Fuera de geocerca", employeeWorkdayId: String(row.employee_workday_id) }); totalIncidentCount += 1; }

      if (classified.justified) {
        op.justified += 1;
        totals.justifiedCount += 1;
        continue;
      }

      if (classified.unavailable) {
        op.unavailable += 1;
        totals.unavailableCount += 1;
        pushIncident(incidents, {
          kind: "UNAVAILABLE",
          employeeName: String(row.employee_name),
          serviceName: String(row.service_name),
          operationId: String(row.operation_id),
          detail: "Informó que no asistirá",
        });
        totalIncidentCount += 1;
      }
      if (classified.pendingConfirmation) {
        op.pendingConfirmation += 1;
        totals.pendingConfirmationCount += 1;
      }

      if (classified.present) {
        op.present += 1;
        totals.presentCount += 1;
        totals.checkinCount += 1;
        if (classified.late) {
          op.late += 1;
          totals.lateCount += 1;
          pushIncident(incidents, {
            kind: "LATE",
            employeeName: String(row.employee_name),
            serviceName: String(row.service_name),
            operationId: String(row.operation_id),
            detail: "Llegada tarde",
          });
          totalIncidentCount += 1;
        }
        if (classified.hasCheckout) {
          totals.checkoutCount += 1;
          if (classified.earlyLeave) {
            op.earlyLeave += 1;
            totals.earlyLeaveCount += 1;
            pushIncident(incidents, {
              kind: "EARLY_LEAVE",
              employeeName: String(row.employee_name),
              serviceName: String(row.service_name),
              operationId: String(row.operation_id),
              detail: "Salida anticipada",
            });
            totalIncidentCount += 1;
          }
        } else if (classified.missingCheckout) {
          op.missingCheckout += 1;
          totals.missingCheckoutCount += 1;
          pushIncident(incidents, {
            kind: "MISSING_CHECKOUT",
            employeeName: String(row.employee_name),
            serviceName: String(row.service_name),
            operationId: String(row.operation_id),
            detail: "Sin registro de salida",
          });
          totalIncidentCount += 1;
        } else if (classified.incomplete) {
          op.incomplete += 1;
          totals.incompleteCount += 1;
          pushIncident(incidents, {
            kind: "INCOMPLETE",
            employeeName: String(row.employee_name),
            serviceName: String(row.service_name),
            operationId: String(row.operation_id),
            detail: "Jornada aún abierta al momento de evaluación",
          });
          totalIncidentCount += 1;
        }
      } else if (classified.missingCheckin) {
        op.missingCheckin += 1;
        totals.missingCheckinCount += 1;
        pushIncident(incidents, {
          kind: "MISSING_CHECKIN",
          employeeName: String(row.employee_name),
          serviceName: String(row.service_name),
          operationId: String(row.operation_id),
          detail: "Sin registro de llegada",
        });
        totalIncidentCount += 1;
      } else if (classified.incomplete) {
        op.incomplete += 1;
        totals.incompleteCount += 1;
      }
    }

    const operations = [...byOw.values()];
    totals.operationsCount = operations.length;

    return {
      companyId: input.companyId,
      companyName,
      reportDate: input.reportDate,
      timezoneId: input.timezoneId,
      evaluatedAtIso: evaluatedAt.toISOString(),
      totals,
      operations,
      incidents: incidents.slice(0, MAX_INCIDENTS),
      totalIncidentCount,
      hasActivity: true,
      workdays,
    };
  },
};

const pushIncident = (
  list: DailyAttendanceReportIncident[],
  incident: DailyAttendanceReportIncident,
): void => {
  if (list.length < MAX_INCIDENTS) {
    list.push(incident);
  }
};
