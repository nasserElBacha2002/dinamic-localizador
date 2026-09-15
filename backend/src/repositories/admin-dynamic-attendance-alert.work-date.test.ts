import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapAdminAlertOperationalPayloadForTest } from "../repositories/admin-dynamic-attendance-alert.repository";

describe("admin dynamic attendance alert work_date payload", () => {
  const baseRecord = {
    company_id: "11111111-1111-1111-1111-111111111111",
    operation_id: "22222222-2222-2222-2222-222222222222",
    operation_workday_id: "33333333-3333-3333-3333-333333333333",
    operation_shift_id: "44444444-4444-4444-4444-444444444444",
    employee_workday_id: "55555555-5555-5555-5555-555555555555",
    shift_name_snapshot: "Mañana",
    employee_name: "Ana Test",
    service_name: "Local Centro",
    service_address: null,
    service_locality: null,
    scheduled_start: new Date("2026-09-15T12:00:00.000Z"),
    scheduled_end: new Date("2026-09-15T20:00:00.000Z"),
    operation_timezone: "America/Argentina/Buenos_Aires",
  };

  it("missing check-in payload uses YYYY-MM-DD from Date work_date", () => {
    const payload = mapAdminAlertOperationalPayloadForTest(
      { ...baseRecord, work_date: new Date("2026-09-15T00:00:00.000Z") },
      { minutesLate: 12 },
    );
    assert.equal(payload.workDate, "2026-09-15");
    assert.equal(payload.minutesLate, 12);
    assert.equal(payload.employeeWorkdayId, baseRecord.employee_workday_id);
  });

  it("missing checkout payload uses YYYY-MM-DD from string work_date", () => {
    const payload = mapAdminAlertOperationalPayloadForTest(
      { ...baseRecord, work_date: "2026-09-16" },
      { minutesUntilStart: undefined },
    );
    assert.equal(payload.workDate, "2026-09-16");
  });

  it("expired incident payload uses ISO datetime prefix", () => {
    const payload = mapAdminAlertOperationalPayloadForTest({
      ...baseRecord,
      work_date: "2026-09-17T15:30:00.000Z",
    });
    assert.equal(payload.workDate, "2026-09-17");
  });

  it("rejects non YYYY-MM-DD shapes in observable payload", () => {
    const fromDate = mapAdminAlertOperationalPayloadForTest({
      ...baseRecord,
      work_date: new Date(Date.UTC(2026, 8, 18)),
    });
    const fromString = mapAdminAlertOperationalPayloadForTest({
      ...baseRecord,
      work_date: "2026-09-18",
    });
    assert.match(String(fromDate.workDate), /^\d{4}-\d{2}-\d{2}$/);
    assert.match(String(fromString.workDate), /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(fromDate.workDate, fromString.workDate);
  });
});
