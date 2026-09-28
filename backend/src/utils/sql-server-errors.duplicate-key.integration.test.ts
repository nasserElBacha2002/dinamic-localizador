/**
 * Proves matchesDuplicateKeyConstraint against a real mssql / SQL Server duplicate-key error.
 * Uses UQ_companies_name (database/migrations/019_companies_name_unique.sql) — low-risk, no schema change.
 */
import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "../database/connection";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import {
  getDuplicateKeyConstraint,
  isDuplicateKeyError,
  matchesDuplicateKeyConstraint,
} from "./sql-server-errors";

const COMPANIES_NAME_UNIQUE = "UQ_companies_name";

describeDatabaseIntegration("sql-server-errors duplicate key (live mssql)", () => {
  const fixtureName = `4d-dup-key-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let insertedId: string | null = null;

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  after(async () => {
    try {
      const pool = getPool();
      if (insertedId) {
        await pool
          .request()
          .input("id", sql.UniqueIdentifier, insertedId)
          .query(`DELETE FROM companies WHERE id = @id`);
      }
      await pool
        .request()
        .input("name", sql.NVarChar(200), fixtureName)
        .query(`DELETE FROM companies WHERE name = @name`);
    } finally {
      await teardownDatabaseIntegration();
    }
  });

  it("classifies a real UQ_companies_name violation via mssql error shape", async () => {
    const pool = getPool();

    const first = await pool
      .request()
      .input("name", sql.NVarChar(200), fixtureName)
      .input("defaultTimezone", sql.NVarChar(100), "America/Argentina/Buenos_Aires")
      .input("status", sql.NVarChar(30), "ACTIVE")
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO companies (name, default_timezone, status)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@name, @defaultTimezone, @status);
        SELECT id FROM @inserted;
      `);
    insertedId = String(first.recordset[0].id);

    let caught: unknown = null;
    try {
      await pool
        .request()
        .input("name", sql.NVarChar(200), fixtureName)
        .input("defaultTimezone", sql.NVarChar(100), "America/Argentina/Buenos_Aires")
        .input("status", sql.NVarChar(30), "ACTIVE")
        .query(`
          INSERT INTO companies (name, default_timezone, status)
          VALUES (@name, @defaultTimezone, @status);
        `);
    } catch (error) {
      caught = error;
    }

    assert.ok(caught, "second insert must throw");
    assert.equal(isDuplicateKeyError(caught), true);

    const maybe = caught as { number?: number; originalError?: { number?: number } };
    const numberShape =
      typeof maybe.number === "number"
        ? "TOP_LEVEL"
        : typeof maybe.originalError?.number === "number"
          ? "ORIGINAL_ERROR"
          : "OTHER";
    assert.ok(
      numberShape === "TOP_LEVEL" || numberShape === "ORIGINAL_ERROR",
      `unexpected duplicate number shape: ${numberShape}`,
    );

    const extracted = getDuplicateKeyConstraint(caught);
    if (extracted) {
      assert.equal(extracted, COMPANIES_NAME_UNIQUE);
      assert.equal(matchesDuplicateKeyConstraint(caught, COMPANIES_NAME_UNIQUE), true);
      assert.equal(matchesDuplicateKeyConstraint(caught, "UQ_companies"), false);
    } else {
      // Driver sometimes omits the index name; still require duplicate classification.
      assert.equal(isDuplicateKeyError(caught), true);
      assert.equal(
        matchesDuplicateKeyConstraint(caught, COMPANIES_NAME_UNIQUE),
        false,
        "without extractable name, exact match must not invent a hit",
      );
    }
  });
});
