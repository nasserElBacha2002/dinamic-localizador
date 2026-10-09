import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";

describe("employee creationMode import policy", () => {
  it("exposes explicit interactive|import creationMode (not skipNotifications)", () => {
    const servicePath = path.resolve(__dirname, "../services/employee.service.ts");
    const source = readFileSync(servicePath, "utf8");
    assert.match(source, /export type EmployeeCreationMode = "interactive" \| "import"/);
    assert.match(source, /creationMode === "import"/);
    assert.doesNotMatch(source, /skipNotifications/);
    assert.match(source, /createManyForImport/);
    assert.match(source, /replaceForEmployee/);
    const replaceIndex = source.indexOf("replaceForEmployee");
    const commitIndex = source.indexOf("await transaction.commit()", replaceIndex);
    assert.ok(replaceIndex > -1 && commitIndex > replaceIndex);
  });

  it("employee import strategy uses creationMode import on row fallback", () => {
    const strategyPath = path.resolve(__dirname, "./strategies/employees.strategy.ts");
    const source = readFileSync(strategyPath, "utf8");
    assert.match(source, /creationMode:\s*"import"/);
    assert.match(source, /createManyForImport/);
  });
});
