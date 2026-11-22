import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateEphemeralIntegrationDatabaseName,
  isEphemeralIntegrationDatabaseName,
} from "./ephemeral-database-names";
import { isProtectedPersistentDatabaseName } from "./test-sql-server-guard";

describe("ephemeral database names (DIN-462)", () => {
  it("generates din_test uuid names", () => {
    const name = generateEphemeralIntegrationDatabaseName();
    assert.equal(isEphemeralIntegrationDatabaseName(name), true);
  });

  it("treats dinamic_attendance as protected", () => {
    assert.equal(isProtectedPersistentDatabaseName("dinamic_attendance"), true);
    assert.equal(isProtectedPersistentDatabaseName(generateEphemeralIntegrationDatabaseName()), false);
  });
});