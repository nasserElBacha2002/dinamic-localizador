import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reconcilePayrollQueryDeliverySchema } from "./payroll-query-reconciliation.schema";

const base = {
  commandId: "11111111-1111-4111-8111-111111111111",
  expectedProcessingVersion: 3,
  reason: "Verificado en la consola del proveedor",
};

describe("payroll query reconciliation schema", () => {
  it("requires provider evidence for confirmed accepted sends", () => {
    assert.equal(
      reconcilePayrollQueryDeliverySchema.safeParse({
        ...base,
        resolution: "CONFIRMED_ACCEPTED",
        providerMessageSid: "SM123",
      }).success,
      true,
    );
    assert.equal(
      reconcilePayrollQueryDeliverySchema.safeParse({
        ...base,
        resolution: "CONFIRMED_ACCEPTED",
      }).success,
      false,
    );
  });

  it("forbids provider evidence when explicitly approving a retry", () => {
    assert.equal(
      reconcilePayrollQueryDeliverySchema.safeParse({
        ...base,
        resolution: "CONFIRMED_NOT_SENT",
      }).success,
      true,
    );
    assert.equal(
      reconcilePayrollQueryDeliverySchema.safeParse({
        ...base,
        resolution: "CONFIRMED_NOT_SENT",
        providerMessageSid: "SM123",
      }).success,
      false,
    );
  });
});
