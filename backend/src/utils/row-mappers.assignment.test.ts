import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapAssignmentRow, mapUserRow, toDateOnlyString } from "./row-mappers";

describe("toDateOnlyString", () => {
  it("formats SQL Date objects as ISO calendar dates", () => {
    assert.equal(toDateOnlyString(new Date("2026-07-05T00:00:00.000Z")), "2026-07-05");
  });

  it("keeps ISO date strings unchanged", () => {
    assert.equal(toDateOnlyString("2026-07-05"), "2026-07-05");
  });

  it("does not shift calendar dates when mapping UTC midnight Date values", () => {
    assert.equal(toDateOnlyString(new Date("2026-07-13T00:00:00.000Z")), "2026-07-13");
  });

  it("maps date-only strings parsed as UTC without shifting", () => {
    assert.equal(toDateOnlyString("2026-07-13"), "2026-07-13");
  });

  it("preserves round-trip calendar dates from JSON serialization", () => {
    const payload = JSON.stringify({ workDate: "2026-07-13" });
    const parsed = JSON.parse(payload) as { workDate: string };
    assert.equal(toDateOnlyString(parsed.workDate), "2026-07-13");
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

describe("mapUserRow", () => {
  const baseUserRow = {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Admin",
    email: "admin@example.com",
    password_hash: "hash",
    role: "ADMIN",
    is_platform_admin: true,
    active: true,
    token_version: 2,
    two_factor_enabled: true,
    two_factor_secret_encrypted: "enc",
    two_factor_last_used_step: 10,
    two_factor_pending_secret_encrypted: null,
    created_at: new Date("2026-08-01T12:00:00.000Z"),
    updated_at: new Date("2026-08-01T12:00:00.000Z"),
  };

  it("maps null optional timestamps without throwing", () => {
    const user = mapUserRow({
      ...baseUserRow,
      two_factor_confirmed_at: null,
      two_factor_pending_created_at: null,
      last_login_at: null,
    });
    assert.equal(user.twoFactorConfirmedAt, null);
    assert.equal(user.twoFactorPendingCreatedAt, null);
    assert.equal(user.lastLoginAt, null);
    assert.equal(user.tokenVersion, 2);
  });

  it("treats invalid Date objects on optional timestamps as null", () => {
    const user = mapUserRow({
      ...baseUserRow,
      two_factor_confirmed_at: new Date(Number.NaN),
      two_factor_pending_created_at: new Date("not-a-date"),
      last_login_at: "not-a-date",
    });
    assert.equal(user.twoFactorConfirmedAt, null);
    assert.equal(user.twoFactorPendingCreatedAt, null);
    assert.equal(user.lastLoginAt, null);
  });
});
