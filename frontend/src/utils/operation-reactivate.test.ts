import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { isOperationReactivatable } from "./operation-status";

describe("operation reactivation frontend", () => {
  it("only cancelled operations are reactivatable", () => {
    assert.equal(isOperationReactivatable("CANCELLED"), true);
    assert.equal(isOperationReactivatable("SCHEDULED"), false);
  });

  it("wires reactivate endpoint, hook and detail action", () => {
    const apiFile = readFileSync(join(process.cwd(), "src/api/operations.api.ts"), "utf8");
    const hooksFile = readFileSync(join(process.cwd(), "src/hooks/useOperations.ts"), "utf8");
    const pageFile = readFileSync(
      join(process.cwd(), "src/pages/operations/OperationDetailPage.tsx"),
      "utf8",
    );
    const endpointsFile = readFileSync(join(process.cwd(), "src/api/endpoints.ts"), "utf8");

    assert.match(endpointsFile, /operationReactivatePath/);
    assert.match(apiFile, /reactivateOperation/);
    assert.match(hooksFile, /useReactivateOperation/);
    assert.match(pageFile, /Reactivar operación/);
    assert.match(pageFile, /canReactivate/);
    assert.match(
      pageFile,
      /no se reiniciarán automáticamente trabajos o procesamientos cancelados/,
    );
  });
});
