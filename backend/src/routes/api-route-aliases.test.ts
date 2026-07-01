import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const readRouteFile = (relativePath: string): string =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

describe("API route aliases registration", () => {
  it("mounts store and location aliases on the same router", () => {
    const routesFile = readRouteFile("src/routes/index.ts");
    assert.match(routesFile, /router\.use\("\/stores", moduleGuard, storeRouter\)/);
    assert.match(routesFile, /router\.use\("\/locations", moduleGuard, storeRouter\)/);
    assert.match(routesFile, /mountInventoryOperationsStoreRoutes\(companyScopedOperationalRouter\)/);
    assert.match(routesFile, /mountInventoryOperationsStoreRoutes\(operationalRouter\)/);
  });

  it("mounts inventory and operation aliases on the same router", () => {
    const routesFile = readRouteFile("src/routes/index.ts");
    assert.match(routesFile, /router\.use\("\/inventories", moduleGuard, inventoryRouter\)/);
    assert.match(routesFile, /router\.use\("\/operations", moduleGuard, inventoryRouter\)/);
  });

  it("mounts employee and worker aliases on the same router", () => {
    const routesFile = readRouteFile("src/routes/index.ts");
    assert.match(routesFile, /router\.use\("\/employees", moduleGuard, employeeRouter\)/);
    assert.match(routesFile, /router\.use\("\/workers", moduleGuard, employeeRouter\)/);
  });

  it("registers lookup aliases alongside canonical lookup paths", () => {
    const lookupRoutes = readRouteFile("src/routes/lookup.routes.ts");
    assert.match(lookupRoutes, /registerStoreLookupRoute\("\/stores"\)/);
    assert.match(lookupRoutes, /registerStoreLookupRoute\("\/locations"\)/);
    assert.match(lookupRoutes, /registerInventoryLookupRoute\("\/inventories"\)/);
    assert.match(lookupRoutes, /registerInventoryLookupRoute\("\/operations"\)/);
    assert.match(lookupRoutes, /registerEmployeeLookupRoute\("\/employees"\)/);
    assert.match(lookupRoutes, /registerEmployeeLookupRoute\("\/workers"\)/);
  });

  it("does not introduce new permission or module keys for aliases", () => {
    const routesFile = readRouteFile("src/routes/index.ts");
    assert.doesNotMatch(routesFile, /locations:read/);
    assert.doesNotMatch(routesFile, /operations:read/);
    assert.doesNotMatch(routesFile, /workers:read/);
    assert.doesNotMatch(routesFile, /COMPANY_MODULE_KEYS\.LOCATIONS/);
    assert.doesNotMatch(routesFile, /COMPANY_MODULE_KEYS\.OPERATIONS/);
    assert.doesNotMatch(routesFile, /COMPANY_MODULE_KEYS\.WORKERS/);
  });
});
