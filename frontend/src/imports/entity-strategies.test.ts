import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getImportEntityStrategy,
  IMPORT_ENTITY_STRATEGIES,
  isImportEntityType,
} from "../imports/entity-strategies";

describe("import entity UI strategies", () => {
  it("exposes operations, services and employees", () => {
    assert.deepEqual(
      IMPORT_ENTITY_STRATEGIES.map((strategy) => strategy.entityType),
      ["operations", "services", "employees"],
    );
  });

  it("keeps operations help mentioning company defaults", () => {
    const strategy = getImportEntityStrategy("operations");
    assert.match(strategy.help, /configuración de operaciones/);
  });

  it("validates entity type helpers", () => {
    assert.equal(isImportEntityType("services"), true);
    assert.equal(isImportEntityType("nope"), false);
  });
});
