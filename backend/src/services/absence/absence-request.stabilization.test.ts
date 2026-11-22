import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  describeDatabaseIntegration,
  requireDinamicCompanyId,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../../test-helpers/integration-test";
import { isAbsenceCancelIntent } from "../../utils/absence/absence-intent";

describe("absence request stabilization", () => {
  it("recognizes global cancel intent for active bot sessions", () => {
    assert.equal(isAbsenceCancelIntent("Cancelar"), true);
    assert.equal(isAbsenceCancelIntent("cancelar flujo"), true);
    assert.equal(isAbsenceCancelIntent("Llegué"), false);
  });
});
