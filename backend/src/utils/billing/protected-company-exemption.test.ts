import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS } from "../../constants/billing-company-exemption";
import {
  companyNamesMatchForExemption,
  findProtectedStrategicExemptionByCompanyId,
  isProtectedStrategicCompanyId,
  normalizeCompanyId,
} from "./protected-company-exemption";

describe("protected company exemption identity", () => {
  it("identifies protected companies only by canonical UUID", () => {
    for (const entry of PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS) {
      const lower = entry.companyId.toLowerCase();
      assert.equal(isProtectedStrategicCompanyId(lower), true);
      assert.equal(
        findProtectedStrategicExemptionByCompanyId(lower)?.expectedName,
        entry.expectedName,
      );
    }
    assert.equal(isProtectedStrategicCompanyId("00000000-0000-0000-0000-000000000001"), false);
  });

  it("matches expected company names with trimmed comparison", () => {
    assert.equal(companyNamesMatchForExemption("  Dinamic Systems ", "Dinamic Systems"), true);
    assert.equal(companyNamesMatchForExemption("pruebas-nasser", "Otra empresa"), false);
  });

  it("normalizes UUID casing", () => {
    assert.equal(
      normalizeCompanyId("59d5ff94-6614-419a-9c9d-485383cde043"),
      "59D5FF94-6614-419A-9C9D-485383CDE043",
    );
  });
});