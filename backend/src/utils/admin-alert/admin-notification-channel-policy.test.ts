import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideAdminNotificationChannel,
  shouldMaterializeAdminWhatsApp,
} from "./admin-notification-channel-policy";

describe("admin-notification-channel-policy", () => {
  const legacy = "WHATSAPP_LEGACY" as const;
  const daily = "DAILY_EMAIL" as const;

  it("keeps urgents on WhatsApp in both modes", () => {
    for (const mode of [legacy, daily]) {
      assert.equal(
        decideAdminNotificationChannel({ mode, alertType: "EMPLOYEE_UNAVAILABLE" }),
        "WHATSAPP_URGENT",
      );
      assert.equal(
        decideAdminNotificationChannel({ mode, alertType: "ATTENDANCE_THRESHOLD_CROSSED" }),
        "WHATSAPP_URGENT",
      );
    }
  });

  it("routes informational types to daily report only under DAILY_EMAIL", () => {
    for (const alertType of [
      "ATTENDANCE_CONFIRMATION_MISSING",
      "MISSING_CHECKIN_AFTER_START",
      "MISSING_CHECKOUT_AFTER_END",
    ]) {
      assert.equal(
        decideAdminNotificationChannel({ mode: daily, alertType }),
        "DAILY_REPORT_ONLY",
      );
      assert.equal(shouldMaterializeAdminWhatsApp({ mode: daily, alertType }), false);
      assert.equal(
        decideAdminNotificationChannel({ mode: legacy, alertType }),
        "WHATSAPP_URGENT",
      );
    }
  });

  it("never reactivates legacy missing check-in after operation", () => {
    assert.equal(
      decideAdminNotificationChannel({
        mode: legacy,
        alertType: "MISSING_CHECKIN_AFTER_OPERATION",
      }),
      "AUDIT_ONLY",
    );
    assert.equal(
      decideAdminNotificationChannel({
        mode: daily,
        alertType: "MISSING_CHECKIN_AFTER_OPERATION",
      }),
      "AUDIT_ONLY",
    );
  });

  it("treats ABSENCE_REQUEST_PENDING as AUDIT_ONLY under DAILY_EMAIL (no third urgent WA)", () => {
    assert.equal(
      decideAdminNotificationChannel({ mode: daily, alertType: "ABSENCE_REQUEST_PENDING" }),
      "AUDIT_ONLY",
    );
    assert.equal(
      decideAdminNotificationChannel({ mode: legacy, alertType: "ABSENCE_REQUEST_PENDING" }),
      "WHATSAPP_URGENT",
    );
  });

  it("forwards location as AUDIT_ONLY under strict DAILY_EMAIL unless security WA enabled", () => {
    assert.equal(
      decideAdminNotificationChannel({
        mode: daily,
        alertType: "FORWARDED_LOCATION_REJECTED",
      }),
      "AUDIT_ONLY",
    );
    assert.equal(
      decideAdminNotificationChannel({
        mode: daily,
        alertType: "FORWARDED_LOCATION_REJECTED",
        securityWhatsAppEnabled: true,
      }),
      "WHATSAPP_URGENT",
    );
  });

  it("unknown types are AUDIT_ONLY (safe default)", () => {
    assert.equal(
      decideAdminNotificationChannel({ mode: daily, alertType: "TOTALLY_UNKNOWN" }),
      "AUDIT_ONLY",
    );
    assert.equal(
      decideAdminNotificationChannel({ mode: legacy, alertType: "TOTALLY_UNKNOWN" }),
      "AUDIT_ONLY",
    );
  });
});
