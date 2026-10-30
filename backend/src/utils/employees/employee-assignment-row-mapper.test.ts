import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapEmployeeAssignedOperationRow } from "./employee-assignment-row-mapper";

describe("mapEmployeeAssignedOperationRow", () => {
  const baseRow = {
    assignment_id: "asg-1",
    operation_id: "op-1",
    operation_kind: "ONE_TIME",
    operation_workday_id: "ow-1",
    employee_workday_id: "ew-1",
    operation_status: "SCHEDULED",
    confirmation_status: "PENDING",
    received_at: null,
    checkout_at: null,
    punctuality_status: null,
    service_name: "Carrefour Caballito",
    service_address: "Av. Rivadavia 5108",
    service_locality: "Caballito",
    service_latitude: -34.6,
    service_longitude: -58.4,
  };

  it("maps service reference fields from SQL aliases", () => {
    const row = mapEmployeeAssignedOperationRow({
      ...baseRow,
      scheduled_start: "2026-07-08T23:30:00.000Z",
      scheduled_end: "2026-07-09T06:00:00.000Z",
    });

    assert.equal(row.serviceName, "Carrefour Caballito");
    assert.equal(row.serviceAddress, "Av. Rivadavia 5108");
    assert.equal(row.serviceLocality, "Caballito");
    assert.equal(row.scheduledEnd, "2026-07-09T06:00:00.000Z");
    assert.equal(row.operationWorkdayId, "ow-1");
    assert.equal(row.employeeWorkdayId, "ew-1");
  });

  it("preserves null scheduledEnd", () => {
    const row = mapEmployeeAssignedOperationRow({
      ...baseRow,
      scheduled_start: "2026-07-08T23:30:00.000Z",
      scheduled_end: null,
    });

    assert.equal(row.scheduledEnd, null);
    assert.equal(row.scheduledStart, "2026-07-08T23:30:00.000Z");
  });
});
