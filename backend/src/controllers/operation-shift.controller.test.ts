import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../errors/app-error";
import { operationShiftController } from "./operation-shift.controller";

describe("operationShiftController schedule mode transitions", () => {
  it("rejects the public transition to multi-shift", async () => {
    await assert.rejects(
      () => operationShiftController.transitionToMultiShift(),
      (error: unknown) =>
        error instanceof AppError && error.code === "OPERATION_SCHEDULE_MODE_IMMUTABLE",
    );
  });

  it("rejects the public transition to single schedule", async () => {
    await assert.rejects(
      () => operationShiftController.transitionToSingle(),
      (error: unknown) =>
        error instanceof AppError && error.code === "OPERATION_SCHEDULE_MODE_IMMUTABLE",
    );
  });
});
