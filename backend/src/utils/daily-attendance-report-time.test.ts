import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";
import { classifyDailyAttendanceReportRow } from "./daily-attendance-report-classify";
import {
  hasLocalReportTimeArrived,
  listCatchUpReportDates,
  normalizeReportTimeHHmm,
  resolveReportCutoffUtc,
  resolveReportDateLocal,
} from "./daily-attendance-report-time";
import {
  escapeHtml,
  isValidReportEmail,
  normalizeReportEmail,
} from "./daily-attendance-report-email";
import { buildDailyAttendanceReportEmail } from "../services/daily-attendance-report-email.builder";
import type { DailyAttendanceReportPayload } from "../types/daily-attendance-report";

describe("daily-attendance-report-time", () => {
  it("resolves D-1 in America/Argentina/Buenos_Aires without subtracting 24h UTC", () => {
    // 2026-03-15 02:30 ART = 2026-03-15 05:30 UTC
    const nowUtc = new Date("2026-03-15T05:30:00.000Z");
    const { reportDate } = resolveReportDateLocal(
      nowUtc,
      "America/Argentina/Buenos_Aires",
    );
    assert.equal(reportDate, "2026-03-14");
  });

  it("supports two companies in different timezones on the same UTC instant", () => {
    // 2026-06-02 03:30 UTC → 00:30 in Buenos Aires (report D-1 = June 1)
    // and 20:30 previous evening in Los Angeles (report D-1 = May 31)
    const nowUtc = new Date("2026-06-02T03:30:00.000Z");
    const ba = resolveReportDateLocal(nowUtc, "America/Argentina/Buenos_Aires");
    const la = resolveReportDateLocal(nowUtc, "America/Los_Angeles");
    assert.equal(ba.reportDate, "2026-06-01");
    assert.equal(la.reportDate, "2026-05-31");
    assert.notEqual(ba.reportDate, la.reportDate);
  });

  it("handles midnight boundary in company timezone", () => {
    const justBefore = new Date("2026-01-02T02:59:00.000Z"); // 23:59 ART Jan 1
    const justAfter = new Date("2026-01-02T03:00:00.000Z"); // 00:00 ART Jan 2
    assert.equal(
      resolveReportDateLocal(justBefore, "America/Argentina/Buenos_Aires").reportDate,
      "2025-12-31",
    );
    assert.equal(
      resolveReportDateLocal(justAfter, "America/Argentina/Buenos_Aires").reportDate,
      "2026-01-01",
    );
  });

  it("interprets report_time as local clock and respects DST zones", () => {
    // America/New_York spring forward 2026-03-08
    const beforeLocalSend = new Date("2026-03-09T11:59:00.000Z"); // 07:59 EDT
    const afterLocalSend = new Date("2026-03-09T12:00:00.000Z"); // 08:00 EDT
    assert.equal(
      hasLocalReportTimeArrived(beforeLocalSend, "America/New_York", "08:00"),
      false,
    );
    assert.equal(
      hasLocalReportTimeArrived(afterLocalSend, "America/New_York", "08:00"),
      true,
    );
  });

  it("cutoff is start of next local day (not UTC midnight)", () => {
    const cutoff = resolveReportCutoffUtc("2026-03-14", "America/Argentina/Buenos_Aires");
    // 2026-03-15 00:00 ART = 2026-03-15 03:00 UTC
    assert.equal(cutoff.toISOString(), "2026-03-15T03:00:00.000Z");
  });

  it("limits catch-up window", () => {
    const nowUtc = new Date("2026-03-15T12:00:00.000Z");
    const dates = listCatchUpReportDates(nowUtc, "America/Argentina/Buenos_Aires", 3);
    assert.deepEqual(dates, ["2026-03-14", "2026-03-13", "2026-03-12"]);
  });

  it("normalizes SQL TIME and HH:mm", () => {
    assert.equal(normalizeReportTimeHHmm("08:00:00"), "08:00");
    assert.equal(normalizeReportTimeHHmm("08:00"), "08:00");
  });
});

describe("daily-attendance-report-classify", () => {
  const base = {
    expectationStatus: "EXPECTED",
    confirmationStatus: "CONFIRMED" as string | null,
    punctualityStatus: "ON_TIME" as string | null,
    expectedStartAt: new Date("2026-03-14T23:00:00.000Z"),
    expectedEndAt: new Date("2026-03-15T02:00:00.000Z") as Date | null,
    receivedAt: null as Date | null,
    checkoutAt: null as Date | null,
    lateToleranceMinutes: 15,
    earlyLeaveToleranceMinutes: 15,
    cutoffAt: new Date("2026-03-15T03:00:00.000Z"),
  };

  it("marks present with check-in", () => {
    const c = classifyDailyAttendanceReportRow({
      ...base,
      receivedAt: new Date("2026-03-14T23:05:00.000Z"),
      checkoutAt: new Date("2026-03-15T02:05:00.000Z"),
    });
    assert.equal(c.present, true);
    assert.equal(c.hasCheckout, true);
    assert.equal(c.missingCheckin, false);
  });

  it("marks late arrivals", () => {
    const c = classifyDailyAttendanceReportRow({
      ...base,
      punctualityStatus: "LATE",
      receivedAt: new Date("2026-03-14T23:40:00.000Z"),
      checkoutAt: new Date("2026-03-15T02:10:00.000Z"),
    });
    assert.equal(c.late, true);
  });

  it("marks early leave", () => {
    const c = classifyDailyAttendanceReportRow({
      ...base,
      receivedAt: new Date("2026-03-14T23:05:00.000Z"),
      checkoutAt: new Date("2026-03-15T01:00:00.000Z"),
    });
    assert.equal(c.earlyLeave, true);
  });

  it("marks missing check-in after due", () => {
    const c = classifyDailyAttendanceReportRow(base);
    assert.equal(c.missingCheckin, true);
  });

  it("marks missing checkout when window closed", () => {
    const c = classifyDailyAttendanceReportRow({
      ...base,
      receivedAt: new Date("2026-03-14T23:05:00.000Z"),
      checkoutAt: null,
    });
    assert.equal(c.missingCheckout, true);
  });

  it("does not mark absence for overnight jornada still open at cutoff", () => {
    // Night shift work_date D-1 ending after midnight of D — if cutoff is before end, incomplete
    const c = classifyDailyAttendanceReportRow({
      ...base,
      expectedStartAt: new Date("2026-03-14T23:00:00.000Z"),
      expectedEndAt: new Date("2026-03-15T06:00:00.000Z"),
      receivedAt: new Date("2026-03-14T23:10:00.000Z"),
      checkoutAt: null,
      cutoffAt: new Date("2026-03-15T03:00:00.000Z"),
    });
    assert.equal(c.incomplete, true);
    assert.equal(c.missingCheckout, false);
  });

  it("marks justified separately", () => {
    const c = classifyDailyAttendanceReportRow({
      ...base,
      expectationStatus: "JUSTIFIED",
    });
    assert.equal(c.justified, true);
    assert.equal(c.missingCheckin, false);
  });

  it("marks unavailable without missing check-in", () => {
    const c = classifyDailyAttendanceReportRow({
      ...base,
      confirmationStatus: "UNAVAILABLE",
    });
    assert.equal(c.unavailable, true);
    assert.equal(c.missingCheckin, false);
  });

  it("marks pending confirmation", () => {
    const c = classifyDailyAttendanceReportRow({
      ...base,
      confirmationStatus: "PENDING",
      receivedAt: new Date("2026-03-14T23:05:00.000Z"),
      checkoutAt: new Date("2026-03-15T02:05:00.000Z"),
    });
    assert.equal(c.pendingConfirmation, true);
    assert.equal(c.present, true);
  });

  it("keeps overnight work_date on D-1 via cutoff for that civil date", () => {
    // Documented: jornada starting D-1 ending after midnight belongs to report_date D-1
    const reportDate = "2026-03-14";
    const cutoff = resolveReportCutoffUtc(reportDate, "America/Argentina/Buenos_Aires");
    const startLocal = DateTime.fromISO("2026-03-14T22:00", {
      zone: "America/Argentina/Buenos_Aires",
    });
    const endLocal = DateTime.fromISO("2026-03-15T04:00", {
      zone: "America/Argentina/Buenos_Aires",
    });
    assert.ok(startLocal.toUTC().toJSDate().getTime() < cutoff.getTime());
    assert.ok(endLocal.toUTC().toJSDate().getTime() > cutoff.getTime());
  });
});

describe("daily-attendance-report-email", () => {
  it("normalizes and validates emails", () => {
    assert.equal(normalizeReportEmail("  Admin@Empresa.COM "), "admin@empresa.com");
    assert.equal(isValidReportEmail("admin@empresa.com"), true);
    assert.equal(isValidReportEmail("not-an-email"), false);
  });

  it("escapes HTML / XSS in email builder", () => {
    assert.equal(escapeHtml(`<script>alert(1)</script>`), "&lt;script&gt;alert(1)&lt;/script&gt;");
    const payload: DailyAttendanceReportPayload = {
      companyId: "c1",
      companyName: `<img src=x onerror=alert(1)>`,
      reportDate: "2026-03-14",
      timezoneId: "America/Argentina/Buenos_Aires",
      cutoffAtIso: "2026-03-15T03:00:00.000Z",
      totals: {
        operationsCount: 1,
        scheduledEmployeesCount: 1,
        presentCount: 0,
        checkinCount: 0,
        checkoutCount: 0,
        lateCount: 0,
        earlyLeaveCount: 0,
        unavailableCount: 0,
        justifiedCount: 0,
        pendingConfirmationCount: 0,
        missingCheckinCount: 1,
        missingCheckoutCount: 0,
        incompleteCount: 0,
      },
      operations: [
        {
          operationId: "o1",
          operationWorkdayId: "ow1",
          workDate: "2026-03-14",
          serviceName: `<b>Evil</b>`,
          expectedStartAt: "2026-03-14T23:00:00.000Z",
          expectedEndAt: "2026-03-15T02:00:00.000Z",
          scheduledEmployees: 1,
          present: 0,
          missingCheckin: 1,
          missingCheckout: 0,
          late: 0,
          earlyLeave: 0,
          unavailable: 0,
          justified: 0,
          pendingConfirmation: 0,
          incomplete: 0,
        },
      ],
      incidents: [
        {
          kind: "MISSING_CHECKIN",
          employeeName: `Eve<script>`,
          serviceName: `Store</td>`,
          operationId: "o1",
          detail: `Detalle"`,
        },
      ],
      hasActivity: true,
    };
    const email = buildDailyAttendanceReportEmail(payload);
    assert.match(email.subject, /2026-03-14/);
    assert.doesNotMatch(email.html, /<script>/);
    assert.match(email.html, /&lt;script&gt;/);
    assert.match(email.html, /&lt;b&gt;Evil&lt;\/b&gt;/);
    assert.match(email.html, /Eve&lt;script&gt;/);
  });
});
