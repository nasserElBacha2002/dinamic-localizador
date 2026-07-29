import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { doesOperationUpdateResetConfirmations } from "./operation-confirmation-reset";
import type { OperationDetail } from "../types/operation";
import type { OperationFormValues } from "../schemas/operation.schema";
import { isoToDatetimeLocal } from "./dates";

const baseOperation = {
  id: "op-1",
  serviceId: "svc-1",
  operationKind: "ONE_TIME",
  scheduledStart: "2026-07-25T12:00:00.000Z",
  scheduledEnd: "2026-07-25T18:00:00.000Z",
  earlyToleranceMinutes: 15,
  lateToleranceMinutes: 10,
  status: "SCHEDULED",
  notes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  service: {
    id: "svc-1",
    name: "Centro",
    address: null,
    neighborhood: null,
    locality: null,
    serviceFormat: null,
    latitude: -34.6,
    longitude: -58.4,
    allowedRadiusMeters: 150,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  assignedEmployees: [],
  attendanceRecordsCount: 0,
} as OperationDetail;

function values(overrides: Partial<OperationFormValues> = {}): OperationFormValues {
  return {
    operationKind: "ONE_TIME",
    serviceId: "svc-1",
    scheduledStart: isoToDatetimeLocal(baseOperation.scheduledStart!),
    scheduledEnd: isoToDatetimeLocal(baseOperation.scheduledEnd!),
    validFrom: "",
    validUntil: "",
    scheduleSource: "COMPANY",
    scheduleDays: [],
    earlyToleranceMinutes: 15,
    lateToleranceMinutes: 10,
    notes: "",
    status: "SCHEDULED",
    ...overrides,
  };
}

describe("doesOperationUpdateResetConfirmations", () => {
  it("is false when only notes change", () => {
    assert.equal(
      doesOperationUpdateResetConfirmations(baseOperation, values({ notes: "hola" })),
      false,
    );
  });

  it("is true when scheduledStart changes for ONE_TIME", () => {
    assert.equal(
      doesOperationUpdateResetConfirmations(
        baseOperation,
        values({ scheduledStart: "2026-07-26T09:00" }),
      ),
      true,
    );
  });

  it("is false for RECURRING operations", () => {
    assert.equal(
      doesOperationUpdateResetConfirmations(
        { ...baseOperation, operationKind: "RECURRING" },
        values({ scheduledStart: "2026-07-26T09:00", operationKind: "RECURRING" }),
      ),
      false,
    );
  });
});
