import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  API_ENDPOINTS,
  operationAssignmentPath,
  operationPath,
  servicePath,
} from "./endpoints";

describe("API_ENDPOINTS", () => {
  it("defines operational API paths", () => {
    assert.equal(API_ENDPOINTS.services, "services");
    assert.equal(API_ENDPOINTS.operations, "operations");
    assert.equal(API_ENDPOINTS.employees, "employees");
    assert.equal(API_ENDPOINTS.lookups.services, "lookups/services");
    assert.equal(API_ENDPOINTS.lookups.operations, "lookups/operations");
    assert.equal(API_ENDPOINTS.lookups.employees, "lookups/employees");
  });

  it("builds nested operation assignment paths", () => {
    assert.equal(operationAssignmentPath("op-1"), "operations/op-1/employees");
    assert.equal(operationPath("op-1"), "operations/op-1");
    assert.equal(servicePath("svc-1"), "services/svc-1");
  });
});

describe("operational API client endpoint usage", () => {
  const readApiFile = (fileName: string): string =>
    readFileSync(join(process.cwd(), "src/api", fileName), "utf8");

  it("services.api uses /services", () => {
    const content = readApiFile("services.api.ts");
    assert.match(content, /API_ENDPOINTS\.services/);
    assert.doesNotMatch(content, /["'`]stores["'`]/);
    assert.doesNotMatch(content, /API_ENDPOINTS\.locations/);
  });

  it("operations.api uses /operations for CRUD, import and attendance summary", () => {
    const content = readApiFile("operations.api.ts");
    assert.match(content, /API_ENDPOINTS\.operations/);
    assert.match(content, /\$\{API_ENDPOINTS\.operations\}\/import\/preview/);
    assert.match(content, /\$\{API_ENDPOINTS\.operations\}\/import\/confirm/);
    assert.match(content, /operationPath\(/);
  });

  it("operations.api uses assignment routes on /operations/:id/employees", () => {
    const content = readApiFile("operations.api.ts");
    const endpoints = readApiFile("endpoints.ts");
    assert.match(content, /operationAssignmentPath/);
    assert.match(endpoints, /API_ENDPOINTS\.operations/);
    assert.match(endpoints, /\$\{operationId\}\/employees/);
    assert.doesNotMatch(endpoints, /LEGACY_API_ENDPOINTS/);
  });

  it("lookups.api uses operational lookup paths", () => {
    const content = readApiFile("lookups.api.ts");
    assert.match(content, /API_ENDPOINTS\.lookups\.services/);
    assert.match(content, /API_ENDPOINTS\.lookups\.operations/);
    assert.match(content, /API_ENDPOINTS\.lookups\.employees/);
    assert.doesNotMatch(content, /lookups\/locations/);
  });

  it("employees.api still uses /employees", () => {
    const content = readApiFile("employees.api.ts");
    assert.match(content, /["'`]employees["'`]/);
    assert.doesNotMatch(content, /workers/);
  });
});
