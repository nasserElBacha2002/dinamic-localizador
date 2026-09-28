import { DateTime } from "luxon";
import { monthlyAttendanceReportRepository, type MonthlyAttendanceReportRow } from "../repositories/monthly-attendance-report.repository";
import type {
  MonthlyAttendanceEmployeeStats,
  MonthlyAttendanceIncident,
  MonthlyAttendanceIncidentType,
  MonthlyAttendanceMetrics,
  MonthlyAttendanceReportDataset,
  MonthlyAttendanceServiceStats,
} from "../types/monthly-attendance-report";
import {
  calculateAbsenceRate,
  calculateAttendanceRate,
  calculatePunctualityRate,
} from "../utils/attendance-statistics-metrics";
import { toDateOnlyString } from "../utils/row-mappers";

const emptyMetrics = (): MonthlyAttendanceMetrics => ({
  scheduledWorkdays: 0, presentWorkdays: 0, absentWorkdays: 0, justifiedWorkdays: 0,
  attendanceRate: 0, absenteeismRate: 0, onTimeWorkdays: 0, lateWorkdays: 0,
  punctualityRate: 0, earlyCheckoutWorkdays: 0, missingCheckinWorkdays: 0,
  missingCheckoutWorkdays: 0, notifiedUnavailableWorkdays: 0,
  confirmedButAbsentWorkdays: 0, unannouncedAbsenceWorkdays: 0,
  pendingReviewAttendances: 0, rejectedAttendances: 0, outsideGeofenceAttendances: 0,
  workedMinutes: 0, extraWorkedMinutes: 0,
});

const iso = (value: Date | string | null): string | null =>
  value == null ? null : (value instanceof Date ? value : new Date(value)).toISOString();
const asDate = (value: Date | string | null): Date | null => value == null ? null : new Date(value);

const addMetrics = (metrics: MonthlyAttendanceMetrics, row: MonthlyAttendanceReportRow, referenceAt: Date): MonthlyAttendanceIncidentType[] => {
  const incidents: MonthlyAttendanceIncidentType[] = [];
  const state = row.effective_state;
  const absent = state === "ABSENT";
  const present = state === "PRESENT";
  const justified = state === "JUSTIFIED";
  const expectedStart = asDate(row.expected_start_at);
  const expectedEnd = asDate(row.expected_end_at);
  // Daily-report semantics: once start + late tolerance elapsed, an expected arrival is missing.
  const missingCheckin = Boolean(
    !present && state !== "JUSTIFIED" && state !== "CANCELLED" &&
    row.confirmation_status !== "UNAVAILABLE" && expectedStart &&
    referenceAt.getTime() >= expectedStart.getTime() + Number(row.late_tolerance_minutes ?? 0) * 60_000,
  );
  const missingCheckout = Boolean(
    present && row.check_in_at && !row.check_out_at && expectedEnd && referenceAt.getTime() > expectedEnd.getTime(),
  );

  if (state !== "CANCELLED") metrics.scheduledWorkdays += 1;
  if (present) metrics.presentWorkdays += 1;
  if (absent) metrics.absentWorkdays += 1;
  if (justified) metrics.justifiedWorkdays += 1;
  if (Number(row.is_on_time_workday) === 1) metrics.onTimeWorkdays += 1;
  if (Number(row.is_late_workday) === 1) { metrics.lateWorkdays += 1; incidents.push("LATE"); }
  if (Number(row.is_early_departure_workday) === 1) { metrics.earlyCheckoutWorkdays += 1; incidents.push("EARLY_CHECKOUT"); }
  if (missingCheckin) { metrics.missingCheckinWorkdays += 1; incidents.push("MISSING_CHECKIN"); }
  // Matches Statistics' open-attendance temporal rule: a missing checkout only after expected end.
  if (missingCheckout) { metrics.missingCheckoutWorkdays += 1; incidents.push("MISSING_CHECKOUT"); }
  if (row.confirmation_status === "UNAVAILABLE") { metrics.notifiedUnavailableWorkdays += 1; incidents.push("UNAVAILABLE"); }
  if (row.confirmation_status === "CONFIRMED" && absent) { metrics.confirmedButAbsentWorkdays += 1; incidents.push("CONFIRMED_BUT_ABSENT"); }
  if (absent && row.confirmation_status !== "UNAVAILABLE" && row.expectation_status !== "JUSTIFIED") {
    metrics.unannouncedAbsenceWorkdays += 1; incidents.push("UNANNOUNCED_ABSENCE");
  }
  if (row.validation_status === "PENDING_REVIEW") { metrics.pendingReviewAttendances += 1; incidents.push("PENDING_REVIEW"); }
  if (row.validation_status === "REJECTED") { metrics.rejectedAttendances += 1; incidents.push("REJECTED_ATTENDANCE"); }
  if (row.location_status === "OUTSIDE_GEOFENCE") { metrics.outsideGeofenceAttendances += 1; incidents.push("OUTSIDE_GEOFENCE"); }
  metrics.workedMinutes += Number(row.worked_minutes ?? 0);
  metrics.extraWorkedMinutes += Number(row.overtime_minutes ?? 0);
  return incidents;
};

const finalizeMetrics = <T extends MonthlyAttendanceMetrics>(metrics: T): T => ({
  ...metrics,
  attendanceRate: calculateAttendanceRate(metrics.presentWorkdays, metrics.absentWorkdays),
  absenteeismRate: calculateAbsenceRate(metrics.presentWorkdays, metrics.absentWorkdays),
  punctualityRate: calculatePunctualityRate(metrics.onTimeWorkdays, metrics.lateWorkdays),
});

const toIncident = (row: MonthlyAttendanceReportRow, type: MonthlyAttendanceIncidentType): MonthlyAttendanceIncident => ({
  type, employeeWorkdayId: String(row.employee_workday_id), employeeId: String(row.employee_id),
  employeeName: String(row.employee_name), operationWorkdayId: String(row.operation_workday_id),
  operationId: String(row.operation_id), serviceId: String(row.service_id), serviceName: String(row.service_name),
  workDate: toDateOnlyString(row.work_date), operationShiftId: row.operation_shift_id ? String(row.operation_shift_id) : null,
  shiftNameSnapshot: row.shift_name_snapshot ? String(row.shift_name_snapshot) : null,
  confirmationStatus: row.confirmation_status, expectationStatus: String(row.expectation_status),
  effectiveState: String(row.effective_state), checkInAt: iso(row.check_in_at), checkOutAt: iso(row.check_out_at),
  expectedStartAt: iso(row.expected_start_at), expectedEndAt: iso(row.expected_end_at),
  validationStatus: row.validation_status, locationStatus: row.location_status,
  punctualityStatus: row.punctuality_status, checkoutStatus: row.checkout_status,
});

export const buildMonthlyAttendanceDatasetFromRows = (input: {
  companyId: string; year: number; month: number; timezone: string; evaluatedAt: Date; rows: MonthlyAttendanceReportRow[];
}): MonthlyAttendanceReportDataset => {
  const start = DateTime.fromObject({ year: input.year, month: input.month, day: 1 }, { zone: input.timezone });
  if (!start.isValid || input.month < 1 || input.month > 12) throw new Error("INVALID_MONTHLY_REPORT_PERIOD");
  const end = start.plus({ months: 1 });
  const summary = emptyMetrics();
  const employees = new Map<string, MonthlyAttendanceEmployeeStats>();
  const services = new Map<string, MonthlyAttendanceServiceStats>();
  const incidents: MonthlyAttendanceIncident[] = [];
  for (const row of input.rows) {
    const employee = employees.get(String(row.employee_id)) ?? { employeeId: String(row.employee_id), employeeName: String(row.employee_name), ...emptyMetrics() };
    const service = services.get(String(row.service_id)) ?? { serviceId: String(row.service_id), serviceName: String(row.service_name), ...emptyMetrics() };
    const rowIncidents = addMetrics(summary, row, input.evaluatedAt);
    addMetrics(employee, row, input.evaluatedAt);
    addMetrics(service, row, input.evaluatedAt);
    employees.set(employee.employeeId, employee); services.set(service.serviceId, service);
    for (const type of rowIncidents) incidents.push(toIncident(row, type));
  }
  return {
    schemaVersion: 1, companyId: input.companyId,
    period: { year: input.year, month: input.month, timezone: input.timezone, start: start.toUTC().toISO()!, endExclusive: end.toUTC().toISO()! },
    evaluatedAt: input.evaluatedAt.toISOString(),
    summary: {
      ...finalizeMetrics(summary),
      totalWorkedMinutes: summary.workedMinutes,
      totalExtraWorkedMinutes: summary.extraWorkedMinutes,
    },
    employees: [...employees.values()].map(finalizeMetrics).sort((a, b) => a.employeeName.localeCompare(b.employeeName) || a.employeeId.localeCompare(b.employeeId)),
    services: [...services.values()].map(finalizeMetrics).sort((a, b) => a.serviceName.localeCompare(b.serviceName) || a.serviceId.localeCompare(b.serviceId)),
    incidents: incidents.sort((a, b) => a.workDate.localeCompare(b.workDate) || a.serviceName.localeCompare(b.serviceName) || a.employeeName.localeCompare(b.employeeName) || a.type.localeCompare(b.type)),
  };
};

export const monthlyAttendanceReportService = {
  async buildMonthlyAttendanceReport(input: { companyId: string; year: number; month: number; timezone: string; evaluatedAt?: Date }): Promise<MonthlyAttendanceReportDataset> {
    const evaluatedAt = input.evaluatedAt ?? new Date();
    const start = DateTime.fromObject({ year: input.year, month: input.month, day: 1 }, { zone: input.timezone });
    if (!start.isValid || input.month < 1 || input.month > 12) throw new Error("INVALID_MONTHLY_REPORT_PERIOD");
    const rows = await monthlyAttendanceReportRepository.listRows({
      companyId: input.companyId, dateFrom: start.toFormat("yyyy-MM-dd"), dateTo: start.plus({ months: 1 }).minus({ days: 1 }).toFormat("yyyy-MM-dd"), referenceAt: evaluatedAt,
    });
    return buildMonthlyAttendanceDatasetFromRows({ ...input, evaluatedAt, rows });
  },
};
