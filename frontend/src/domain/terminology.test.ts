import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignedWorkersLabel,
  formatTerminology,
  getTerminologyLabel,
  legacyTerminology,
  locationAddressLabel,
  operationScheduleLabel,
  terminology,
} from "./terminology";

describe("terminology", () => {
  it("defines location, operation, and worker entries", () => {
    assert.ok(terminology.location);
    assert.ok(terminology.operation);
    assert.ok(terminology.worker);
    assert.ok(terminology.attendance);
    assert.ok(terminology.absence);
  });

  it("uses recommended Spanish product labels", () => {
    assert.equal(terminology.location.singular, "Ubicación");
    assert.equal(terminology.location.plural, "Ubicaciones");
    assert.equal(terminology.operation.singular, "Operación");
    assert.equal(terminology.operation.plural, "Operaciones");
    assert.equal(terminology.worker.singular, "Colaborador");
    assert.equal(terminology.worker.plural, "Colaboradores");
    assert.equal(terminology.attendance.plural, "Asistencias");
    assert.equal(terminology.absence.plural, "Ausencias");
  });

  it("keeps legacy labels available", () => {
    assert.equal(terminology.location.legacySingular, "Tienda");
    assert.equal(terminology.location.legacyPlural, "Tiendas");
    assert.equal(terminology.operation.legacySingular, "Inventario");
    assert.equal(terminology.operation.legacyPlural, "Inventarios");
    assert.equal(terminology.worker.legacySingular, "Empleado");
    assert.equal(terminology.worker.legacyPlural, "Empleados");
    assert.deepEqual(legacyTerminology.location, { singular: "Tienda", plural: "Tiendas" });
  });

  it("keeps technical keys stable", () => {
    assert.equal(terminology.location.technical, "store");
    assert.equal(terminology.operation.technical, "inventory");
    assert.equal(terminology.worker.technical, "employee");
  });

  it("resolves labels via helpers", () => {
    assert.equal(getTerminologyLabel("operation", "plural"), "Operaciones");
    assert.equal(formatTerminology("worker", "Nuevo {term}", "singular"), "Nuevo Colaborador");
    assert.equal(assignedWorkersLabel, "Colaboradores asignados");
    assert.equal(locationAddressLabel, "Dirección de la ubicación");
    assert.equal(operationScheduleLabel, "Horario de la operación");
  });
});
