import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OperationDetail, OperationWithService } from "../types/operation";
import { UNASSIGNED_LABEL } from "./display-safe";
import { getOperationDisplayName } from "./operation-display";

const listBase = {
  id: "op-1",
  serviceId: "svc-1",
  operationKind: "ONE_TIME" as const,
  scheduledStart: "2026-06-23T14:00:00.000Z",
  scheduledEnd: "2026-06-23T22:00:00.000Z",
  earlyToleranceMinutes: 15,
  lateToleranceMinutes: 15,
  status: "SCHEDULED" as const,
  notes: null,
  createdAt: "2026-06-23T10:00:00.000Z",
  updatedAt: "2026-06-23T10:00:00.000Z",
};

describe("getOperationDisplayName", () => {
  it("uses the linked service name for list and detail payloads", () => {
    const listRow = {
      ...listBase,
      service: { id: "svc-1", name: "Centro", address: "Av. 1", active: true },
    } as OperationWithService;

    const detail = {
      ...listBase,
      service: {
        id: "svc-1",
        name: "Centro",
        address: "Av. 1",
        neighborhood: null,
        locality: null,
        serviceFormat: null,
        latitude: 0,
        longitude: 0,
        allowedRadiusMeters: 150,
        active: true,
        createdAt: listBase.createdAt,
        updatedAt: listBase.updatedAt,
      },
      assignedEmployees: [],
      attendanceRecordsCount: 0,
    } as OperationDetail;

    assert.equal(getOperationDisplayName(listRow), "Centro");
    assert.equal(getOperationDisplayName(detail), "Centro");
    assert.equal(getOperationDisplayName(listRow), getOperationDisplayName(detail));
  });

  it("returns the same identity for two operations of the same service", () => {
    const service = { id: "svc-1", name: "Depósito Norte", address: null, active: true };
    const first = { ...listBase, id: "op-a", service } as OperationWithService;
    const second = {
      ...listBase,
      id: "op-b",
      scheduledStart: "2026-06-24T14:00:00.000Z",
      service,
    } as OperationWithService;

    assert.equal(getOperationDisplayName(first), getOperationDisplayName(second));
    assert.equal(getOperationDisplayName(first), "Depósito Norte");
  });

  it("falls back when service name is missing", () => {
    const row = {
      ...listBase,
      service: { id: "svc-1", name: "   ", address: null, active: true },
    } as OperationWithService;

    assert.equal(getOperationDisplayName(row), UNASSIGNED_LABEL);
    assert.equal(getOperationDisplayName(null), UNASSIGNED_LABEL);
    assert.equal(getOperationDisplayName({ service: undefined }), UNASSIGNED_LABEL);
  });

  it("does not surface raw operation ids as the display name", () => {
    const row = {
      ...listBase,
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      service: undefined,
    } as unknown as OperationWithService;

    assert.equal(getOperationDisplayName(row), UNASSIGNED_LABEL);
    assert.notEqual(getOperationDisplayName(row), row.id);
  });
});
