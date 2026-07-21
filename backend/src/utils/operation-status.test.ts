import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canTransitionOperationStatus,
  isOperationReactivatable,
  OPERATION_REACTIVATION_STATUS,
} from "./operation-status";

describe("operation status transitions", () => {
  it("allows CANCELLED → SCHEDULED for reactivation", () => {
    assert.equal(canTransitionOperationStatus("CANCELLED", OPERATION_REACTIVATION_STATUS), true);
    assert.equal(OPERATION_REACTIVATION_STATUS, "SCHEDULED");
  });

  it("rejects CANCELLED → IN_PROGRESS", () => {
    assert.equal(canTransitionOperationStatus("CANCELLED", "IN_PROGRESS"), false);
  });

  it("marks only CANCELLED as reactivatable", () => {
    assert.equal(isOperationReactivatable("CANCELLED"), true);
    assert.equal(isOperationReactivatable("SCHEDULED"), false);
    assert.equal(isOperationReactivatable("IN_PROGRESS"), false);
    assert.equal(isOperationReactivatable("COMPLETED"), false);
  });
});
