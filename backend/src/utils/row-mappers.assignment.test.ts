import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapAssignmentRow, toDateOnlyString } from "./row-mappers";

describe("toDateOnlyString", () => {
  it("formats SQL Date objects as ISO calendar dates", () => {
    assert.equal(toDateOnlyString(new Date("2026-07-05T00:00:00.000Z")), "2026-07-05");
  });

  it("keeps ISO date strings unchanged", () => {
    assert.equal(toDateOnlyString("2026-07-05"), "2026-07-05");
  });
});

describe("mapAssignmentRow", () => {
  it("maps assignment validity dates from Date objects", () => {
    const assignment = mapAssignmentRow({
      id: "00000000-0000-4000-8000-000000000001",
      company_id: "00000000-0000-4000-8000-000000000002",
      operation_id: "00000000-0000-4000-8000-000000000003",
      employee_id: "00000000-0000-4000-8000-000000000004",
      valid_from: new Date("2026-07-05T00:00:00.000Z"),
      valid_until: null,
      assigned_at: new Date("2026-07-05T12:00:00.000Z"),
      created_at: new Date("2026-07-05T12:00:00.000Z"),
      updated_at: new Date("2026-07-05T12:00:00.000Z"),
    });

    assert.equal(assignment.validFrom, "2026-07-05");
    assert.equal(assignment.validUntil, null);
  });
});
