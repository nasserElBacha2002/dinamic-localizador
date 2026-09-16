import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WHATSAPP_RETENTION_TABLE_KEYS } from "../constants/whatsapp-retention";

describe("whatsapp quota retention whitelist", () => {
  it("includes all quota tables in FK-safe delete order", () => {
    const keys = [...WHATSAPP_RETENTION_TABLE_KEYS];
    const notices = keys.indexOf("whatsapp_quota_limit_notices");
    const reservations = keys.indexOf("whatsapp_quota_outbound_reservations");
    const admissions = keys.indexOf("whatsapp_quota_turn_admissions");
    const employeePeriods = keys.indexOf("whatsapp_quota_employee_periods");
    const companyPeriods = keys.indexOf("whatsapp_quota_company_periods");

    assert.ok(notices >= 0);
    assert.ok(reservations > notices);
    assert.ok(admissions > notices);
    assert.ok(employeePeriods > reservations);
    assert.ok(employeePeriods > admissions);
    assert.ok(companyPeriods > reservations);
  });
});
