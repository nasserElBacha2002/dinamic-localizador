import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Employee } from "../types/domain";
import {
  canViewEmployeeResidenceZone,
  projectEmployeeForRole,
} from "./employee-residence-privacy";

const employeeWithZone = {
  id: "e1",
  name: "Ana",
  documentNumber: null,
  phoneNumber: "+5491100000000",
  employeeType: "fijo",
  categoryId: null,
  category: null,
  locationZoneId: "z1",
  locationZone: {
    id: "z1",
    name: "Caballito",
    locality: "CABA",
    isActive: true,
  },
  active: true,
  lastWorkedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} satisfies Employee;

describe("employee residence privacy", () => {
  it("allows employees:manage roles to view residence zone", () => {
    assert.equal(canViewEmployeeResidenceZone("OWNER"), true);
    assert.equal(canViewEmployeeResidenceZone("ADMIN"), true);
    assert.equal(canViewEmployeeResidenceZone("HR"), true);
  });

  it("denies read-only / supervisor / operator", () => {
    assert.equal(canViewEmployeeResidenceZone("READ_ONLY"), false);
    assert.equal(canViewEmployeeResidenceZone("SUPERVISOR"), false);
    assert.equal(canViewEmployeeResidenceZone("OPERATOR"), false);
    assert.equal(canViewEmployeeResidenceZone(undefined), false);
  });

  it("redacts locationZone fields for non-manage roles", () => {
    const projected = projectEmployeeForRole(employeeWithZone, "SUPERVISOR");
    assert.equal(projected.locationZoneId, null);
    assert.equal(projected.locationZone, null);
    assert.equal(projected.name, "Ana");
  });

  it("keeps locationZone for manage roles", () => {
    const projected = projectEmployeeForRole(employeeWithZone, "HR");
    assert.equal(projected.locationZoneId, "z1");
    assert.equal(projected.locationZone?.name, "Caballito");
  });
});
