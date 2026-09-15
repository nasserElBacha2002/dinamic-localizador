import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { operationScheduleModeTransitionService } from "./operation-schedule-mode-transition.service";
import { workdayMaterializationService } from "./workday-materialization.service";
import { operationRepository } from "../repositories/operation.repository";
import { recurringWorkdayMaterializationService } from "./recurring-workday-materialization.service";
import { companyRepository } from "../repositories/company.repository";
import { employeeShiftIntervalOverlap } from "../utils/employee-shift-interval-overlap";
import { isMutableForExceptionRestore } from "./operation-shift-workday-reconcile.service";

const TIMEZONE = "America/Argentina/Buenos_Aires";

describe("phase2 multi-shift review defect fixes", () => {
  it("transition rejects future effectiveFrom", async () => {
    mock.method(companyRepository, "findById", async () => ({
      id: "c1",
      status: "ACTIVE",
    }));
    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      operationTimezone: TIMEZONE,
    }));

    await assert.rejects(
      () =>
        operationScheduleModeTransitionService.transitionToMultiShift("c1", "op1", {
          effectiveFrom: "2099-01-01",
          shifts: [
            {
              code: "A",
              name: "A",
              startTime: "09:00",
              endTime: "13:00",
            },
          ],
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "TRANSITION_EFFECTIVE_FROM_MUST_BE_TODAY",
    );

    await assert.rejects(
      () =>
        operationScheduleModeTransitionService.transitionToSingle("c1", "op1", {
          effectiveFrom: "2099-01-01",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "TRANSITION_EFFECTIVE_FROM_MUST_BE_TODAY",
    );
  });

  it("ensureOneTime rejects MULTI without calling multi materializer", async () => {
    mock.method(operationRepository, "findById", async () => ({
      id: "op1",
      scheduleMode: "MULTI_SHIFT",
      operationKind: "ONE_TIME",
    }));
    let materializeCalls = 0;
    mock.method(
      recurringWorkdayMaterializationService,
      "materializeMultiShiftOperationHorizon",
      async () => {
        materializeCalls += 1;
        return {};
      },
    );

    await assert.rejects(
      () => workdayMaterializationService.ensureOneTimeOperationMaterialized("c1", "op1"),
      (error: unknown) =>
        error instanceof AppError && error.code === "MULTI_SHIFT_USE_MULTI_MATERIALIZER",
    );
    assert.equal(materializeCalls, 0);
  });

  it("RESTORE reactivation rules: never if attendance or start passed", () => {
    const now = new Date("2026-09-15T12:00:00.000Z");
    assert.equal(
      isMutableForExceptionRestore(
        {
          status: "CANCELLED",
          cancellationReason: "EXCEPTION",
          expectedStartAt: "2099-01-01T12:00:00.000Z",
        },
        false,
        now,
      ),
      true,
    );
    assert.equal(
      isMutableForExceptionRestore(
        {
          status: "CANCELLED",
          cancellationReason: "EXCEPTION",
          expectedStartAt: "2099-01-01T12:00:00.000Z",
        },
        true,
        now,
      ),
      false,
    );
    assert.equal(
      isMutableForExceptionRestore(
        {
          status: "CANCELLED",
          cancellationReason: "EXCEPTION",
          expectedStartAt: "2020-01-01T12:00:00.000Z",
        },
        false,
        now,
      ),
      false,
    );
  });

  it("consecutive shifts allowed; overlapping blocked", () => {
    const morning = {
      operationId: "op-a",
      operationShiftId: "s1",
      workDate: "2026-09-15",
      startTime: "09:00",
      endTime: "13:00",
      timezone: TIMEZONE,
    };
    const consecutive = employeeShiftIntervalOverlap(morning, {
      ...morning,
      operationShiftId: "s2",
      startTime: "13:00",
      endTime: "17:00",
    });
    assert.equal(consecutive.overlaps, false);

    const overlapping = employeeShiftIntervalOverlap(morning, {
      ...morning,
      operationShiftId: "s2",
      startTime: "12:00",
      endTime: "16:00",
    });
    assert.equal(overlapping.overlaps, true);
    if (overlapping.overlaps) {
      assert.equal(overlapping.sameOperation, true);
    }
  });
});
