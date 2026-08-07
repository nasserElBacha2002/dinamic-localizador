import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MigrationCredentialConfigError,
  resolveMigrationDbCredentials,
} from "./migration-db-credentials";

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

  it("treats whitespace-only migration user/password as unset (shared mode)", () => {
    const resolved = resolveMigrationDbCredentials({
      DB_USER: "sa",
      DB_PASSWORD: "shared-secret",
      DB_MIGRATION_USER: "   ",
      DB_MIGRATION_PASSWORD: "\t",
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

  it("rejects migration user only (no silent password reuse)", () => {
    assert.throws(
      () =>
        resolveMigrationDbCredentials({
          DB_USER: "dinamic_runtime",
          DB_PASSWORD: "runtime-secret",
          DB_MIGRATION_USER: "dinamic_migrations",
        }),
      (error: unknown) => {
        assert.ok(error instanceof MigrationCredentialConfigError);
        assert.match(error.message, /DB_MIGRATION_PASSWORD/);
        assert.doesNotMatch(error.message, /runtime-secret|migration-secret/);
        return true;
      },
    );
  });

  it("rejects migration password only", () => {
    assert.throws(
      () =>
        resolveMigrationDbCredentials({
          DB_USER: "dinamic_runtime",
          DB_PASSWORD: "runtime-secret",
          DB_MIGRATION_PASSWORD: "migration-secret",
        }),
      (error: unknown) => {
        assert.ok(error instanceof MigrationCredentialConfigError);
        assert.match(error.message, /DB_MIGRATION_USER/);
        assert.doesNotMatch(error.message, /runtime-secret|migration-secret/);
        return true;
      },
    );
  });

  it("rejects whitespace-only password when migration user is set", () => {
    assert.throws(
      () =>
        resolveMigrationDbCredentials({
          DB_USER: "dinamic_runtime",
          DB_PASSWORD: "runtime-secret",
          DB_MIGRATION_USER: "dinamic_migrations",
          DB_MIGRATION_PASSWORD: "   ",
        }),
      MigrationCredentialConfigError,
    );
  });
});
