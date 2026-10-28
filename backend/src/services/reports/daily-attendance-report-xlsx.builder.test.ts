import assert from "node:assert/strict";
import { it } from "node:test";
import * as XLSX from "xlsx";
import { buildDailyAttendanceReportXlsx } from "./daily-attendance-report-xlsx.builder";

it("builds the daily workbook with one row per employee_workday", () => {
  const payload = { companyId: "c", companyName: "Acme", reportDate: "2026-09-24", timezoneId: "America/Argentina/Buenos_Aires", evaluatedAtIso: new Date().toISOString(), totals: { operationsCount: 2, scheduledEmployeesCount: 2, presentCount: 2, checkinCount: 2, checkoutCount: 2, lateCount: 0, earlyLeaveCount: 0, unavailableCount: 0, justifiedCount: 0, pendingConfirmationCount: 0, missingCheckinCount: 0, missingCheckoutCount: 0, incompleteCount: 0 }, operations: [], incidents: [], totalIncidentCount: 0, hasActivity: true, workdays: [{ employeeWorkdayId: "a", employeeName: "Ana", serviceName: "Centro", operationId: "op", operationWorkdayId: "ow1", expectedStartAt: "2026-09-24T08:00:00.000Z", expectedEndAt: "2026-09-24T16:00:00.000Z", receivedAt: "2026-09-24T08:00:00.000Z", checkoutAt: "2026-09-24T16:00:00.000Z", expectationStatus: "EXPECTED", confirmationStatus: "CONFIRMED", punctualityStatus: "ON_TIME", validationStatus: "VALID", state: "PRESENT", late: false, earlyLeave: false, missingCheckin: false, missingCheckout: false, unavailable: false, justified: false, present: true, incomplete: false }] };
  const wb = XLSX.read(buildDailyAttendanceReportXlsx(payload), { type: "buffer" });
  assert.deepEqual(wb.SheetNames, ["Resumen", "Jornadas", "Incidencias", "Servicios"]);
  assert.equal(XLSX.utils.sheet_to_json(wb.Sheets.Jornadas).length, 1);
});
