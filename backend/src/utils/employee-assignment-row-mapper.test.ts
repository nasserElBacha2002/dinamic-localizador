import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapEmployeeAssignedOperationRow } from "./employee-assignment-row-mapper";

describe("mapEmployeeAssignedOperationRow", () => {
  it("maps service reference fields from SQL aliases", () => {
    const row = mapEmployeeAssignedOperationRow({
      operation_id: "op-1",
      service_name: "Carrefour Caballito",
      service_address: "Av. Rivadavia 5108",
      service_locality: "Caballito",
      service_latitude: -34.6,
      service_longitude: -58.4,
      scheduled_start: "2026-07-08T23:30:00.000Z",
      scheduled_end: "2026-07-09T06:00:00.000Z",
      operation_status: "SCHEDULED",
      confirmation_status: "PENDING",
      received_at: null,
      checkout_at: null,
      punctuality_status: null,
    });

    assert.equal(row.serviceName, "Carrefour Caballito");
    assert.equal(row.serviceAddress, "Av. Rivadavia 5108");
    assert.equal(row.serviceLocality, "Caballito");
  });
});
