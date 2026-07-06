import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignedWorkersLabel,
  formatTerminology,
  getTerminologyLabel,
  legacyTerminology,
  serviceAddressLabel,
  operationScheduleLabel,
  terminology,
} from "./terminology";

describe("terminology", () => {
  it("defines service, operation, and worker entries", () => {
    assert.ok(terminology.service);
    assert.ok(terminology.operation);
    assert.ok(terminology.worker);
    assert.ok(terminology.attendance);
    assert.ok(terminology.absence);
  });

  it("uses recommended Spanish product labels", () => {
    assert.equal(terminology.service.singular, "Servicio");
    assert.equal(terminology.service.plural, "Servicios");
    assert.equal(terminology.operation.singular, "Operación");
    assert.equal(terminology.operation.plural, "Operaciones");
    assert.equal(terminology.worker.singular, "Colaborador");
    assert.equal(terminology.worker.plural, "Colaboradores");
    assert.equal(terminology.attendance.plural, "Asistencias");
    assert.equal(terminology.absence.plural, "Ausencias");
  });

  it("keeps legacy labels available", () => {
    assert.equal(terminology.service.legacySingular, "Tienda");
    assert.equal(terminology.service.legacyPlural, "Tiendas");
    assert.equal(terminology.operation.legacySingular, "Inventario");
    assert.equal(terminology.operation.legacyPlural, "Inventarios");
    assert.equal(terminology.worker.legacySingular, "Empleado");
    assert.equal(terminology.worker.legacyPlural, "Empleados");
    assert.deepEqual(legacyTerminology.service, { singular: "Tienda", plural: "Tiendas" });
  });

  it("keeps technical keys stable", () => {
    assert.equal(terminology.service.technical, "service");
    assert.equal(terminology.operation.technical, "operation");
    assert.equal(terminology.worker.technical, "employee");
  });

  it("resolves labels via helpers", () => {
    assert.equal(getTerminologyLabel("operation", "plural"), "Operaciones");
    assert.equal(formatTerminology("worker", "Nuevo {term}", "singular"), "Nuevo Colaborador");
    assert.equal(assignedWorkersLabel, "Colaboradores asignados");
    assert.equal(serviceAddressLabel, "Dirección del servicio");
    assert.equal(operationScheduleLabel, "Horario de la operación");
  });
});
