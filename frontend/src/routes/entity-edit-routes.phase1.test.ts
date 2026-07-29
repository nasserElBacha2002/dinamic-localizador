import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("entity edit routes phase 1", () => {
  const routesSource = readFileSync(join(process.cwd(), "src/routes/AppRoutes.tsx"), "utf8");

  it("registers four /:id/edit routes before or alongside detail", () => {
    assert.match(routesSource, /path="\/employees\/:id\/edit"/);
    assert.match(routesSource, /path="\/services\/:id\/edit"/);
    assert.match(routesSource, /path="\/work-teams\/:id\/edit"/);
    assert.match(routesSource, /path="\/operations\/:id\/edit"/);
  });

  it("keeps read access on /:id and manage on /edit", () => {
    assert.match(
      routesSource,
      /path="\/employees\/:id\/edit"[\s\S]*?employeeManage[\s\S]*?path="\/employees\/:id"[\s\S]*?employeeAccess/,
    );
    assert.match(
      routesSource,
      /path="\/services\/:id\/edit"[\s\S]*?serviceManage[\s\S]*?path="\/services\/:id"[\s\S]*?serviceAccess/,
    );
    assert.match(
      routesSource,
      /path="\/work-teams\/:id\/edit"[\s\S]*?workTeamManage[\s\S]*?path="\/work-teams\/:id"[\s\S]*?workTeamAccess/,
    );
    assert.match(
      routesSource,
      /path="\/operations\/:id\/edit"[\s\S]*?operationManage[\s\S]*?path="\/operations\/:id"[\s\S]*?operationAccess/,
    );
  });

  it("preserves legacy redirects and does not redirect /:id to /edit", () => {
    assert.match(routesSource, /path="\/stores\/:id"/);
    assert.match(routesSource, /path="\/inventories\/:id"/);
    assert.doesNotMatch(routesSource, /Navigate to=\{`\$\{.*\}\/edit`/);
    assert.doesNotMatch(routesSource, /to=\{`\/employees\/\$\{id\}\/edit`/);
  });

  it("reuses existing edit pages on /edit routes", () => {
    assert.match(routesSource, /EmployeeEditPage/);
    assert.match(routesSource, /ServiceEditPage/);
    assert.match(routesSource, /WorkTeamEditPage/);
    assert.match(routesSource, /OperationEditPage/);
  });
});
