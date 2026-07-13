import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("CreatePlatformCompanyDialog", () => {
  it("splits configuration and access sections with operational inputs", () => {
    const dialogFile = readFileSync(
      join(process.cwd(), "src/pages/platform/CreatePlatformCompanyDialog.tsx"),
      "utf8",
    );

    assert.match(dialogFile, /Configuración operativa/);
    assert.match(dialogFile, /Accesos/);
    assert.match(dialogFile, /getOperationTimezoneOptions/);
    assert.match(dialogFile, /OperationTimeInput/);
    assert.match(dialogFile, /SettingsFormField/);
    assert.match(dialogFile, /defaultEarlyArrivalToleranceMinutes/);
    assert.match(dialogFile, /defaultLateArrivalToleranceMinutes/);
    assert.match(dialogFile, /defaultOperationStartTime/);
    assert.match(dialogFile, /defaultOperationEndTime/);
    assert.match(dialogFile, /COMPANY_MODULE_LABELS/);
    assert.match(dialogFile, /validateCompanySettingsForm/);
    assert.match(dialogFile, /toCompanySettingsUpdateInput/);
    assert.doesNotMatch(dialogFile, /label=\{moduleKey\}/);
  });
});
