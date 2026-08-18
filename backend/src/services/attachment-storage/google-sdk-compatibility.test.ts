import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Real-package compatibility smoke for Phase 4 uuid override.
 * Complements the mocked GCS wrapper contract in gcs-attachment-storage.test.ts.
 */
describe("Google SDK compatibility (real packages, uuid override)", () => {
  it("loads Storage/gaxios/teeny-request with uuid>=11.1.1 and exercises v4 multipart paths", async () => {
    const require = createRequire(import.meta.url);
    const smokePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../scripts/google-sdk-compatibility-smoke.cjs",
    );
    const { runGoogleSdkCompatibilitySmoke, semverGte } = require(smokePath);

    const report = await runGoogleSdkCompatibilitySmoke();

    assert.ok(semverGte(report.uuid, "11.1.1"), `uuid ${report.uuid}`);
    assert.ok(semverGte(report.gaxiosUuid, "11.1.1"), `gaxios uuid ${report.gaxiosUuid}`);
    assert.ok(semverGte(report.teenyUuid, "11.1.1"), `teeny uuid ${report.teenyUuid}`);
    assert.equal(report.storageConstructed, true);
    assert.ok(report.gaxiosBoundary, "gaxios multipart boundary");
    assert.ok(report.teenyBoundary, "teeny-request multipart boundary");
    assert.match(process.version, /^v\d+\./);
  });
});
