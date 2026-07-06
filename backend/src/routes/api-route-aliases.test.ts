import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const readRouteFile = (relativePath: string): string =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

describe("API canonical route registration", () => {
  it("mounts canonical /services routes", () => {
    const routesFile = readRouteFile("src/routes/index.ts");
    assert.match(routesFile, /router\.use\("\/services", moduleGuard, serviceRouter\)/);
    assert.doesNotMatch(routesFile, /router\.use\("\/stores"/);
    assert.doesNotMatch(routesFile, /router\.use\("\/locations"/);
  });

  it("mounts canonical /operations routes", () => {
    const routesFile = readRouteFile("src/routes/index.ts");
    assert.match(routesFile, /router\.use\("\/operations", moduleGuard, operationRouter\)/);
    assert.doesNotMatch(routesFile, /router\.use\("\/inventories"/);
  });

  it("mounts employee and worker aliases on the same router", () => {
    const routesFile = readRouteFile("src/routes/index.ts");
    assert.match(routesFile, /router\.use\("\/employees", moduleGuard, employeeRouter\)/);
    assert.match(routesFile, /router\.use\("\/workers", moduleGuard, employeeRouter\)/);
  });

  it("registers canonical lookup paths only for operations domain", () => {
    const lookupRoutes = readRouteFile("src/routes/lookup.routes.ts");
    assert.match(lookupRoutes, /lookupRouter\.get\(\s*"\/services"/);
    assert.match(lookupRoutes, /lookupRouter\.get\(\s*"\/operations"/);
    assert.doesNotMatch(lookupRoutes, /\/stores"/);
    assert.doesNotMatch(lookupRoutes, /\/locations"/);
    assert.doesNotMatch(lookupRoutes, /\/inventories"/);
    assert.match(lookupRoutes, /registerEmployeeLookupRoute|\/employees"/);
    assert.match(lookupRoutes, /\/workers"/);
  });
});
