import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Employee } from "../types/employee";
import {
  buildEmployeeByIdMap,
  resolveSelectedEmployeeDisplay,
} from "./work-team-member-display";

const employee = (overrides: Partial<Employee> = {}): Employee => ({
  id: "emp-1",
  name: "Juan Pérez",
  documentNumber: null,
  phoneNumber: "+5491100000000",
  employeeType: "fijo",
  active: true,
  lastWorkedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("resolveSelectedEmployeeDisplay", () => {
  it("shows employee name and type instead of uuid", () => {
    const display = resolveSelectedEmployeeDisplay(
      "emp-1",
      buildEmployeeByIdMap([employee()]),
      new Set(),
      new Set(),
    );

    assert.equal(display.name, "Juan Pérez");
    assert.match(display.secondary, /Fijo/);
    assert.equal(display.isLoading, false);
  });

  it("shows inactive badge data for inactive members", () => {
    const display = resolveSelectedEmployeeDisplay(
      "emp-2",
      buildEmployeeByIdMap([
        employee({ id: "emp-2", name: "María Gómez", employeeType: "eventual", active: false }),
      ]),
      new Set(),
      new Set(),
    );

    assert.equal(display.name, "María Gómez");
    assert.match(display.secondary, /Eventual/);
    assert.match(display.secondary, /Inactivo/);
    assert.equal(display.isInactive, true);
  });

  it("shows loading text while employee data is unresolved", () => {
    const display = resolveSelectedEmployeeDisplay(
      "emp-unknown",
      new Map(),
      new Set(["emp-unknown"]),
      new Set(),
    );

    assert.equal(display.name, "Cargando colaborador...");
    assert.equal(display.isLoading, true);
  });

  it("shows unavailable text when employee cannot be resolved", () => {
    const display = resolveSelectedEmployeeDisplay(
      "emp-missing",
      new Map(),
      new Set(),
      new Set(["emp-missing"]),
    );

    assert.equal(display.name, "Colaborador no disponible");
    assert.equal(display.isUnavailable, true);
  });

  it("never uses uuid as visible label", () => {
    const uuid = "7BB7912E-482A-4C03-9A94-6748B161344B";
    const display = resolveSelectedEmployeeDisplay(uuid, new Map(), new Set([uuid]), new Set());

    assert.notEqual(display.name, uuid);
  });
});
