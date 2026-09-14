import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getRoutingResult,
  runWithRoutingResultScope,
  setRoutingResult,
} from "./whatsapp-routing-result";

describe("whatsapp routing result (observability-independent)", () => {
  it("stores flow outcome inside ALS scope", async () => {
    await runWithRoutingResultScope(async () => {
      assert.equal(getRoutingResult()?.flowType, undefined);
      setRoutingResult({
        flowType: "PAYROLL_RECEIPT_QUERY",
        resultCode: "PAYROLL_RECEIPT_SEND_ACCEPTED",
      });
      const routing = getRoutingResult();
      assert.equal(routing?.flowType, "PAYROLL_RECEIPT_QUERY");
      assert.equal(routing?.resultCode, "PAYROLL_RECEIPT_SEND_ACCEPTED");
    });
  });

  it("merges partial routing updates", async () => {
    await runWithRoutingResultScope(async () => {
      setRoutingResult({ flowType: "CHECKIN" });
      setRoutingResult({ resultCode: "CHECKIN_COMPLETED", relatedOperationId: "op-1" });
      const routing = getRoutingResult();
      assert.equal(routing?.flowType, "CHECKIN");
      assert.equal(routing?.resultCode, "CHECKIN_COMPLETED");
      assert.equal(routing?.relatedOperationId, "op-1");
    });
  });

  it("does not leak across scopes", async () => {
    await runWithRoutingResultScope(async () => {
      setRoutingResult({ flowType: "MENU" });
    });
    assert.equal(getRoutingResult(), null);
  });
});
