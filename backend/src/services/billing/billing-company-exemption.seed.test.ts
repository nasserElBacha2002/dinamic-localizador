import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS } from "../../constants/billing-company-exemption";
import {
  BillingCompanyExemptionSeedError,
  validateProtectedStrategicIdentities,
} from "./billing-company-exemption.seed";

describe("validateProtectedStrategicIdentities", () => {
  it("rejects missing UUID before any write", () => {
    const entry = PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS[0];
    assert.throws(
      () =>
        validateProtectedStrategicIdentities([
          { entry, found: false, actualName: null },
        ]),
      (error: unknown) => {
        assert.ok(error instanceof BillingCompanyExemptionSeedError);
        assert.match(String(error), /missing/i);
        return true;
      },
    );
  });

  it("rejects identity mismatch by UUID", () => {
    const entry = PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS[1];
    assert.throws(
      () =>
        validateProtectedStrategicIdentities([
          { entry, found: true, actualName: "Nombre incorrecto" },
        ]),
      (error: unknown) => {
        assert.ok(error instanceof BillingCompanyExemptionSeedError);
        assert.match(String(error), /identity mismatch/i);
        return true;
      },
    );
  });
});