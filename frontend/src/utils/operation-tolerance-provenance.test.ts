import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OperationDetail } from "../types/operation";
import {
  buildOperationEditDefaultValues,
  toOperationUpdatePayload,
} from "./operation-detail-display";

const buildOperation = (
  overrides: Pick<
    OperationDetail,
    "earlyToleranceSource" | "lateToleranceSource"
  >,
  effective: { early: number; late: number } = { early: 40, late: 20 },
): OperationDetail =>
  ({
    id: "operation-1",
    serviceId: "00000000-0000-4000-8000-000000000001",
    operationKind: "ONE_TIME",
    scheduledStart: "2026-09-10T12:00:00.000Z",
    scheduledEnd: "2026-09-10T20:00:00.000Z",
    earlyToleranceMinutes: effective.early,
    lateToleranceMinutes: effective.late,
    ...overrides,
    status: "SCHEDULED",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    service: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Location",
      address: null,
      neighborhood: null,
      locality: null,
      locationZoneId: null,
      serviceFormat: null,
      latitude: -34.6,
      longitude: -58.4,
      allowedRadiusMeters: 150,
      googlePlaceId: null,
      active: true,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
    assignedEmployees: [],
    attendanceRecordsCount: 0,
  }) satisfies OperationDetail;

describe("operation tolerance provenance forms", () => {
  it("represents inherited tolerances and clears overrides in the payload", () => {
    const operation = buildOperation({
      earlyToleranceSource: "COMPANY_DEFAULT",
      lateToleranceSource: "COMPANY_DEFAULT",
    });
    const values = buildOperationEditDefaultValues(operation);

    assert.equal(values.earlyToleranceSource, "COMPANY_DEFAULT");
    assert.equal(values.lateToleranceSource, "COMPANY_DEFAULT");
    const payload = toOperationUpdatePayload(operation, values);
    assert.equal(payload.earlyToleranceMinutes, null);
    assert.equal(payload.lateToleranceMinutes, null);
  });

  it("keeps custom zero and custom values equal to defaults explicit", () => {
    const operation = buildOperation(
      {
        earlyToleranceSource: "CUSTOM",
        lateToleranceSource: "CUSTOM",
      },
      { early: 0, late: 20 },
    );
    const values = buildOperationEditDefaultValues(operation);

    assert.equal(values.earlyToleranceSource, "CUSTOM");
    assert.equal(values.lateToleranceSource, "CUSTOM");
    assert.equal(values.earlyToleranceMinutes, 0);
    assert.equal(values.lateToleranceMinutes, 20);

    const payload = toOperationUpdatePayload(operation, values);
    assert.equal(payload.earlyToleranceMinutes, 0);
    assert.equal(payload.lateToleranceMinutes, 20);
  });
});
