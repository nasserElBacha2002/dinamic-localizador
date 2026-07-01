import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("company module route mounting", () => {
  it("mounts absence guards on explicit paths only", () => {
    const routesFile = readFileSync(
      join(process.cwd(), "src/routes/index.ts"),
      "utf8",
    );
    assert.match(routesFile, /\/absence-types[\s\S]*requireCompanyModule\(COMPANY_MODULE_KEYS\.ABSENCES\)/);
    assert.match(routesFile, /\/absence-requests[\s\S]*requireCompanyModule\(COMPANY_MODULE_KEYS\.ABSENCES\)/);
    assert.doesNotMatch(
      routesFile,
      /companyScopedOperationalRouter\.use\(\s*requireCompanyModule\(COMPANY_MODULE_KEYS\.ABSENCES\)/,
    );
  });

  it("mounts company users before loadCompanyModuleStates", () => {
    const routesFile = readFileSync(
      join(process.cwd(), "src/routes/index.ts"),
      "utf8",
    );
    const scopedBlockStart = routesFile.indexOf("const companyScopedOperationalRouter");
    const scopedBlock = routesFile.slice(scopedBlockStart);
    const usersIndex = scopedBlock.indexOf('companyScopedOperationalRouter.use("/users"');
    const loadModulesIndex = scopedBlock.indexOf("asyncHandler(loadCompanyModuleStates)");
    assert.ok(usersIndex >= 0);
    assert.ok(loadModulesIndex >= 0);
    assert.ok(usersIndex < loadModulesIndex);
  });
});
