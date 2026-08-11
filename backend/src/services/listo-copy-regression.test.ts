import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Listo copy removed from notification-related WhatsApp flows", () => {
  it("does not prefix confirmation / payroll query replies with Listo", () => {
    const files = [
      join(__dirname, "employee-workday.service.ts"),
      join(__dirname, "payroll-receipt-period-query.service.ts"),
      join(__dirname, "whatsapp-router/payroll-receipt.handler.ts"),
    ];
    for (const absolute of files) {
      const source = readFileSync(absolute, "utf8");
      assert.doesNotMatch(source, /Listo/, `${absolute} still contains Listo`);
    }
  });
});
