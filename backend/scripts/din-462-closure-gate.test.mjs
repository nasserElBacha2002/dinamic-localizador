import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  diffNewDatabaseNames,
  evaluateDisposableValidationEnv,
  evaluateExitCode,
  evaluateInventoryListExit,
  evaluateNoNewEphemeralLeaks,
  evaluateTapStrict,
  parseTapSummaryLine,
} from "./din-462-closure-gate.mjs";

describe("din-462-closure-gate", () => {
  it("rejects zero exit when non-zero expected", () => {
    assert.equal(evaluateExitCode(0, false).ok, false);
    assert.equal(evaluateExitCode(1, false).ok, true);
  });

  it("rejects non-zero exit when zero expected", () => {
    assert.equal(evaluateExitCode(0, true).ok, true);
    assert.equal(evaluateExitCode(2, true).ok, false);
  });

  it("parses TAP summary and rejects failures", () => {
    const tap = `# tests 10\n# pass 9\n# fail 1\n# skipped 0\n`;
    const summary = parseTapSummaryLine(tap);
    assert.equal(evaluateTapStrict(summary).ok, false);
  });

  it("accepts TAP with zero failures", () => {
    const tap = `# tests 10\n# pass 10\n# fail 0\n`;
    assert.equal(evaluateTapStrict(parseTapSummaryLine(tap)).ok, true);
  });

  it("detects new ephemeral database names", () => {
    const leaked = diffNewDatabaseNames(["din_test_a"], ["din_test_a", "din_test_b"]);
    assert.deepEqual(leaked, ["din_test_b"]);
    assert.equal(evaluateNoNewEphemeralLeaks(leaked).ok, false);
  });

  it("rejects missing explicit disposable SQL env", () => {
    assert.equal(evaluateDisposableValidationEnv({}).ok, false);
    assert.equal(
      evaluateDisposableValidationEnv({
        TEST_SQL_DISPOSABLE_ACKNOWLEDGED: "true",
        TEST_SQL_ALLOWED_SERVER_NAME: "x",
        TEST_DB_HOST: "localhost",
        TEST_DB_USER: "sa",
        TEST_DB_PASSWORD: "p",
      }).ok,
      false,
    );
    assert.equal(
      evaluateDisposableValidationEnv({
        TEST_SQL_DISPOSABLE_ACKNOWLEDGED: "true",
        TEST_SQL_ALLOWED_SERVER_NAME: "x",
        TEST_SQL_ALLOW_SYSTEM_ADMIN: "true",
        TEST_DB_HOST: "localhost",
        TEST_DB_USER: "sa",
        TEST_DB_PASSWORD: "p",
      }).ok,
      true,
    );
  });

  it("rejects failed mandatory inventory list", () => {
    assert.equal(evaluateInventoryListExit(0).ok, true);
    assert.equal(evaluateInventoryListExit(1).ok, false);
  });
});