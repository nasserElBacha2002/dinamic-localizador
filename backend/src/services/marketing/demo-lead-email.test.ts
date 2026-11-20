import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDemoLeadEmail } from "./demo-lead-email";

describe("buildDemoLeadEmail", () => {
  it("builds text and html without leaking script tags", () => {
    const content = buildDemoLeadEmail({
      to: "sales@example.com",
      submittedAt: new Date("2026-03-20T15:00:00.000Z"),
      lead: {
        fullName: "Ana <script>",
        company: "Acme & Co",
        email: "ana@acme.com",
        employeeRange: "26-100",
        phone: "+54 11 5555-0000",
        serviceLocations: "CABA, Zona Norte",
        companyWebsite: "",
      },
    });

    assert.match(content.subject, /Acme & Co/);
    assert.match(content.text, /ana@acme.com/);
    assert.doesNotMatch(content.html, /<script>/i);
    assert.match(content.html, /&amp; Co/);
  });
});