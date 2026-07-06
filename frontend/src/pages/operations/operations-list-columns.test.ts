import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OperationWithService } from "../../types/operation";
import { UNASSIGNED_LABEL } from "../../utils/display-safe";
import { getOperationServiceAddress, getOperationServiceName } from "./operations-list-columns";

const baseOperation = {
  id: "op-1",
  serviceId: "svc-1",
  scheduledStart: "2026-06-23T14:00:00.000Z",
  scheduledEnd: "2026-06-23T22:00:00.000Z",
  earlyToleranceMinutes: 15,
  lateToleranceMinutes: 15,
  status: "SCHEDULED",
  notes: null,
  createdAt: "2026-06-23T10:00:00.000Z",
  updatedAt: "2026-06-23T10:00:00.000Z",
} as OperationWithService;

describe("operations list column helpers", () => {
  it("renders service name when present", () => {
    const row = {
      ...baseOperation,
      service: {
        id: "svc-1",
        name: "Centro",
        address: "Av. Siempre Viva 742",
        active: true,
      },
    };

    assert.equal(getOperationServiceName(row), "Centro");
    assert.equal(getOperationServiceAddress(row), "Av. Siempre Viva 742");
  });

  it("renders fallback when service is missing", () => {
    const row = {
      ...baseOperation,
      service: undefined,
    } as unknown as OperationWithService;

    assert.equal(getOperationServiceName(row), UNASSIGNED_LABEL);
    assert.equal(getOperationServiceAddress(row), "—");
  });
});
