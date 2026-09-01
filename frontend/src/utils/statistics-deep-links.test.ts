import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAttendanceExceptionHref,
  buildEmployeeAttendanceHref,
  buildOperationAttendanceHref,
  buildOperationDetailHref,
} from "./statistics-deep-links";

describe("statistics deep links", () => {
  const ctx = {
    dateFrom: "2026-08-01T00:00:00.000Z",
    dateTo: "2026-08-31T23:59:59.999Z",
  };

  it("maps geofence and pending review to attendance filters", () => {
    const geo = buildAttendanceExceptionHref("outside_geofence", ctx);
    assert.match(geo, /\/attendance\?/);
    assert.match(geo, /locationStatus=OUTSIDE_GEOFENCE/);
    assert.match(geo, /dateFrom=2026-08-01/);

    const pending = buildAttendanceExceptionHref("pending_review", ctx);
    assert.match(pending, /validationStatus=PENDING_REVIEW/);
  });

  it("routes unjustified absences to statistics employee tab", () => {
    const href = buildAttendanceExceptionHref("unjustified_absence", ctx);
    assert.match(href, /\/statistics\?/);
    assert.match(href, /effectiveState=ABSENT/);
    assert.match(href, /tab=employee/);
  });

  it("applies openAttendance for overdue open check-outs", () => {
    const href = buildAttendanceExceptionHref("open_attendance", ctx);
    assert.match(href, /\/attendance\?/);
    assert.match(href, /openAttendance=true/);
  });

  it("applies checkoutStatus for early departures", () => {
    const href = buildAttendanceExceptionHref("early_departure", ctx);
    assert.match(href, /\/attendance\?/);
    assert.match(href, /checkoutStatus=CHECKOUT_EARLY_REVIEW/);
  });

  it("routes incomplete coverage to statistics operation tab filter", () => {
    const href = buildAttendanceExceptionHref("incomplete_coverage", ctx);
    assert.match(href, /\/statistics\?/);
    assert.match(href, /tab=operation/);
    assert.match(href, /incompleteCoverage=true/);
    assert.match(href, /opSortBy=coverageRate/);
  });

  it("builds employee, operation detail, and operation attendance links", () => {
    assert.equal(
      buildOperationDetailHref("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
      "/operations/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    );
    const emp = buildEmployeeAttendanceHref("11111111-1111-4111-8111-111111111111", ctx);
    assert.match(emp, /employeeIds=11111111-1111-4111-8111-111111111111/);

    const attendance = buildOperationAttendanceHref("22222222-2222-4222-8222-222222222222", ctx);
    assert.match(attendance, /\/attendance\?/);
    assert.match(attendance, /operationIds=22222222-2222-4222-8222-222222222222/);
    assert.match(attendance, /dateFrom=2026-08-01/);
  });
});
