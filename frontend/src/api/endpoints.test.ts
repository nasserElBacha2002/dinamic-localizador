import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  API_ENDPOINTS,
  LEGACY_API_ENDPOINTS,
  inventoryAssignmentPath,
  operationPath,
} from "./endpoints";

describe("API_ENDPOINTS", () => {
  it("defines preferred operational alias paths", () => {
    assert.equal(API_ENDPOINTS.locations, "locations");
    assert.equal(API_ENDPOINTS.operations, "operations");
    assert.equal(API_ENDPOINTS.employees, "employees");
    assert.equal(API_ENDPOINTS.lookups.locations, "lookups/locations");
    assert.equal(API_ENDPOINTS.lookups.operations, "lookups/operations");
    assert.equal(API_ENDPOINTS.lookups.employees, "lookups/employees");
  });

  it("keeps legacy nested inventory assignment path", () => {
    assert.equal(inventoryAssignmentPath("inv-1"), "inventories/inv-1/employees");
    assert.equal(operationPath("op-1"), "operations/op-1");
    assert.equal(LEGACY_API_ENDPOINTS.inventories, "inventories");
  });
});

describe("operational API client endpoint usage", () => {
  const readApiFile = (fileName: string): string =>
    readFileSync(join(process.cwd(), "src/api", fileName), "utf8");

  it("stores.api uses /locations", () => {
    const content = readApiFile("stores.api.ts");
    assert.match(content, /API_ENDPOINTS\.locations/);
    assert.doesNotMatch(content, /["'`]stores["'`]/);
  });

  it("inventories.api uses /operations for CRUD, import and attendance summary", () => {
    const content = readApiFile("inventories.api.ts");
    assert.match(content, /API_ENDPOINTS\.operations/);
    assert.match(content, /\$\{API_ENDPOINTS\.operations\}\/import\/preview/);
    assert.match(content, /\$\{API_ENDPOINTS\.operations\}\/import\/confirm/);
    assert.match(content, /operationPath\(/);
  });

  it("inventories.api keeps assignment routes on /inventories/:id/employees", () => {
    const content = readApiFile("inventories.api.ts");
    const endpoints = readApiFile("endpoints.ts");
    assert.match(content, /inventoryAssignmentPath/);
    assert.match(endpoints, /LEGACY_API_ENDPOINTS\.inventories/);
    assert.match(endpoints, /\$\{inventoryId\}\/employees/);
  });

  it("lookups.api uses operational lookup aliases", () => {
    const content = readApiFile("lookups.api.ts");
    assert.match(content, /API_ENDPOINTS\.lookups\.locations/);
    assert.match(content, /API_ENDPOINTS\.lookups\.operations/);
    assert.match(content, /API_ENDPOINTS\.lookups\.employees/);
    assert.doesNotMatch(content, /lookups\/stores/);
    assert.doesNotMatch(content, /lookups\/inventories/);
  });

  it("employees.api still uses /employees", () => {
    const content = readApiFile("employees.api.ts");
    assert.match(content, /["'`]employees["'`]/);
    assert.doesNotMatch(content, /workers/);
  });
});
