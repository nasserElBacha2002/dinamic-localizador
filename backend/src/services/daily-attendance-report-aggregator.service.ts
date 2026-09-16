import sql from "mssql";
import { getPool } from "../database/connection";
import type {
  DailyAttendanceReportIncident,
  DailyAttendanceReportOperationBreakdown,
  DailyAttendanceReportPayload,
  DailyAttendanceReportTotals,
} from "../types/daily-attendance-report";
import { classifyDailyAttendanceReportRow } from "../utils/daily-attendance-report-classify";
import { resolveReportCutoffUtc } from "../utils/daily-attendance-report-time";
import { toDateOnlyString } from "../utils/row-mappers";

const MAX_INCIDENTS = 40;

type Row = {
  operation_id: string;
  operation_workday_id: string;
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
  company_name: string;
};

const toDate = (value: Date | string | null | undefined): Date | null => {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
};

/**
 * Aggregates attendance for a company civil report_date (operation_workdays.work_date).
 *
 * Classification uses cutoffAt = start of next local day (UTC instant):
 * - missing check-in: EXPECTED, start+lateTolerance <= cutoff, no valid arrival
 * - missing checkout: has arrival, end reached at/before cutoff, no checkout
 * - incomplete: expected window not yet closed at cutoff
 * - early leave: checkout before expected_end - earlyLeaveToleranceMinutes
 *
 * Denominator for scheduled employees: expectation not CANCELLED.
 * Cancelled operation_workdays excluded.
 */
export const dailyAttendanceReportAggregator = {
  async buildReport(input: {
    companyId: string;
    reportDate: string;
    timezoneId: string;
    earlyLeaveToleranceMinutes: number;
  }): Promise<DailyAttendanceReportPayload> {
    const cutoffAt = resolveReportCutoffUtc(input.reportDate, input.timezoneId);
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("reportDate", sql.Date, input.reportDate)
      .query(`
        SELECT
          c.name AS company_name,
          ow.operation_id,
          ow.id AS operation_workday_id,
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
          ar.punctuality_status
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
        OUTER APPLY (
          SELECT TOP 1
            arx.received_at,
            arx.checkout_at,
            arx.punctuality_status
          FROM attendance_records arx
          WHERE arx.company_id = ew.company_id
            AND arx.employee_workday_id = ew.id
            AND arx.is_simulation = 0
            AND arx.validation_status IN (N'VALID', N'PENDING_REVIEW')
          ORDER BY
            CASE WHEN arx.received_at IS NULL THEN 1 ELSE 0 END,
            arx.received_at ASC,
            arx.created_at ASC
        ) ar
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
        cutoffAtIso: cutoffAt.toISOString(),
        totals: {
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
        hasActivity: false,
      };
    }

    const byOw = new Map<string, DailyAttendanceReportOperationBreakdown>();
    const incidents: DailyAttendanceReportIncident[] = [];
    const totals: DailyAttendanceReportTotals = {
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

      const expectedStart = toDate(row.expected_start_at)!;
      const expectedEnd = toDate(row.expected_end_at);
      const receivedAt = toDate(row.received_at);
      const checkoutAt = toDate(row.checkout_at);
      const classified = classifyDailyAttendanceReportRow({
        expectationStatus: String(row.expectation_status),
        confirmationStatus: row.confirmation_status,
        punctualityStatus: row.punctuality_status,
        expectedStartAt: expectedStart,
        expectedEndAt: expectedEnd,
        receivedAt,
        checkoutAt,
        lateToleranceMinutes: Number(row.late_tolerance_minutes ?? 0),
        earlyLeaveToleranceMinutes: input.earlyLeaveToleranceMinutes,
        cutoffAt,
      });

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
        } else if (classified.incomplete) {
          op.incomplete += 1;
          totals.incompleteCount += 1;
          pushIncident(incidents, {
            kind: "INCOMPLETE",
            employeeName: String(row.employee_name),
            serviceName: String(row.service_name),
            operationId: String(row.operation_id),
            detail: "Jornada aún abierta al corte",
          });
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
      cutoffAtIso: cutoffAt.toISOString(),
      totals,
      operations,
      incidents: incidents.slice(0, MAX_INCIDENTS),
      hasActivity: true,
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
