import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveMigrationDbCredentials } from "./migration-db-credentials";

describe("resolveMigrationDbCredentials", () => {
  it("falls back to DB_USER/DB_PASSWORD when migration identity is unset", () => {
    const resolved = resolveMigrationDbCredentials({
      DB_USER: "sa",
      DB_PASSWORD: "shared-secret",
    });
    assert.deepEqual(resolved, {
      user: "sa",
      password: "shared-secret",
      usesDedicatedMigrationIdentity: false,
    });
  });

  it("uses dedicated migration user and password when both are set", () => {
    const resolved = resolveMigrationDbCredentials({
      DB_USER: "dinamic_runtime",
      DB_PASSWORD: "runtime-secret",
      DB_MIGRATION_USER: "dinamic_migrations",
      DB_MIGRATION_PASSWORD: "migration-secret",
    });
    assert.deepEqual(resolved, {
      user: "dinamic_migrations",
      password: "migration-secret",
      usesDedicatedMigrationIdentity: true,
    });
  });

  it("falls back migration password to DB_PASSWORD when only migration user is set", () => {
    const resolved = resolveMigrationDbCredentials({
      DB_USER: "dinamic_runtime",
      DB_PASSWORD: "shared-secret",
      DB_MIGRATION_USER: "dinamic_migrations",
    });
    assert.equal(resolved.user, "dinamic_migrations");
    assert.equal(resolved.password, "shared-secret");
    assert.equal(resolved.usesDedicatedMigrationIdentity, true);
  });
});
