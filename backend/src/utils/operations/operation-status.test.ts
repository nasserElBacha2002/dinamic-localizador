import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canTransitionOperationStatus,
  canTransitionOperationLifecycleStatus,
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

  it("rejects admin PATCH SCHEDULED → COMPLETED", () => {
    assert.equal(canTransitionOperationStatus("SCHEDULED", "COMPLETED"), false);
  });

  it("allows clock lifecycle SCHEDULED → COMPLETED without persisting IN_PROGRESS", () => {
    assert.equal(canTransitionOperationLifecycleStatus("SCHEDULED", "COMPLETED"), true);
    assert.equal(canTransitionOperationLifecycleStatus("SCHEDULED", "IN_PROGRESS"), true);
    assert.equal(canTransitionOperationLifecycleStatus("IN_PROGRESS", "COMPLETED"), true);
  });

  it("does not allow lifecycle to revive CANCELLED or COMPLETED", () => {
    assert.equal(canTransitionOperationLifecycleStatus("CANCELLED", "COMPLETED"), false);
    assert.equal(canTransitionOperationLifecycleStatus("CANCELLED", "SCHEDULED"), false);
    assert.equal(canTransitionOperationLifecycleStatus("COMPLETED", "SCHEDULED"), false);
  });

  it("marks only CANCELLED as reactivatable", () => {
    assert.equal(isOperationReactivatable("CANCELLED"), true);
    assert.equal(isOperationReactivatable("SCHEDULED"), false);
    assert.equal(isOperationReactivatable("IN_PROGRESS"), false);
    assert.equal(isOperationReactivatable("COMPLETED"), false);
  });
});
