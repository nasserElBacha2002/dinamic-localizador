import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapHeadersToColumns } from "../imports/column-mapper";
import { SERVICE_IMPORT_COLUMNS } from "../imports/strategies/services.strategy";
import { EMPLOYEE_IMPORT_COLUMNS } from "../imports/strategies/employees.strategy";
import { importStrategyRegistry } from "../imports/registry";
import { buildCsvTemplate } from "../imports/parse-import-file";

describe("import column mapper", () => {
  it("maps required service headers and reports missing ones", () => {
    const mapped = mapHeadersToColumns(["Nombre", "Latitud"], SERVICE_IMPORT_COLUMNS);
    assert.equal(mapped.mapped.name, 0);
    assert.equal(mapped.mapped.latitude, 1);
    assert.deepEqual(mapped.missingRequired, ["Longitud"]);
  });

  it("detects unknown and duplicate headers", () => {
    const mapped = mapHeadersToColumns(
      ["Nombre", "Nombre", "Foo"],
      SERVICE_IMPORT_COLUMNS,
    );
    assert.ok(mapped.duplicateHeaders.includes("Nombre"));
    assert.ok(mapped.unknownHeaders.includes("Foo"));
  });

  it("accepts employee aliases", () => {
    const mapped = mapHeadersToColumns(
      ["Colaborador", "Telefono", "Tipo"],
      EMPLOYEE_IMPORT_COLUMNS,
    );
    assert.equal(mapped.mapped.name, 0);
    assert.equal(mapped.mapped.phoneNumber, 1);
    assert.equal(mapped.mapped.employeeType, 2);
    assert.equal(mapped.missingRequired.length, 0);
  });
});

describe("import strategy registry", () => {
  it("registers operations, services and employees", () => {
    const types = importStrategyRegistry.list().map((strategy) => strategy.entityType);
    assert.deepEqual(types, ["operations", "services", "employees"]);
  });

  it("builds csv templates for each entity", () => {
    for (const strategy of importStrategyRegistry.list()) {
      const template = strategy.buildTemplate();
      assert.ok(template.fileName.endsWith(".csv"));
      assert.ok(template.body.length > 0);
      assert.match(template.body.toString("utf8"), /,/);
    }
  });

  it("rejects unknown entity types", () => {
    assert.throws(() => importStrategyRegistry.get("widgets"), (error: unknown) => {
      return error instanceof Error && error.message.includes("no soportado");
    });
  });
});

describe("buildCsvTemplate", () => {
  it("escapes quoted values", () => {
    const buffer = buildCsvTemplate(["Nombre", "Notas"], [["Ada", 'Hola, "mundo"']]);
    assert.match(buffer.toString("utf8"), /"Hola, ""mundo"""/);
  });
});
