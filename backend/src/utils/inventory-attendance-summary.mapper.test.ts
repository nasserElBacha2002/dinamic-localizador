import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapInventoryAttendanceSummaryRow } from "./inventory-attendance-summary.mapper";

const baseRow = {
  id: "emp-1",
  name: "Juan Pérez",
  document_number: null,
  phone_number: "+5491112345678",
  employee_type: "fijo",
  active: true,
  created_at: new Date("2026-01-01T00:00:00.000Z"),
  updated_at: new Date("2026-01-01T00:00:00.000Z"),
  attendance_id: null,
};

describe("inventory attendance summary mapper", () => {
  it("maps pending confirmation without timestamps", () => {
    const mapped = mapInventoryAttendanceSummaryRow({
      ...baseRow,
      confirmation_status: "PENDING",
      confirmed_at: null,
      unavailable_at: null,
    });

    assert.equal(mapped.confirmationStatus, "PENDING");
    assert.equal(mapped.confirmedAt, null);
    assert.equal(mapped.unavailableAt, null);
    assert.equal(mapped.operationalStatus, "NO_CHECK_IN");
  });

  it("maps confirmed confirmation with confirmedAt", () => {
    const confirmedAt = new Date("2026-07-14T20:00:00.000Z");
    const mapped = mapInventoryAttendanceSummaryRow({
      ...baseRow,
      confirmation_status: "CONFIRMED",
      confirmed_at: confirmedAt,
      unavailable_at: null,
    });

    assert.equal(mapped.confirmationStatus, "CONFIRMED");
    assert.equal(mapped.confirmedAt, confirmedAt.toISOString());
    assert.equal(mapped.unavailableAt, null);
  });

  it("maps unavailable confirmation with unavailableAt", () => {
    const unavailableAt = new Date("2026-07-14T21:00:00.000Z");
    const mapped = mapInventoryAttendanceSummaryRow({
      ...baseRow,
      confirmation_status: "UNAVAILABLE",
      confirmed_at: null,
      unavailable_at: unavailableAt,
    });

    assert.equal(mapped.confirmationStatus, "UNAVAILABLE");
    assert.equal(mapped.confirmedAt, null);
    assert.equal(mapped.unavailableAt, unavailableAt.toISOString());
  });
});
