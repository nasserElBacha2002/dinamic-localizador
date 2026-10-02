import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { getPool } from "./connection";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";

const MIGRATION_112_PATH = join(
  process.cwd(),
  "..",
  "database/migrations/112_contextual_bot_sessions.sql",
);

const MIGRATION_152_PATH = join(
  process.cwd(),
  "..",
  "database/migrations/152_bot_session_absence_kind_selection.sql",
);

const NEW_ABSENCE_KIND_STATE = "WAITING_ABSENCE_KIND_SELECTION";

describe("bot session absence kind migrations (static SQL)", () => {
  it("allows WAITING_ABSENCE_KIND_SELECTION via CK_bot_sessions_intent_state pattern", () => {
    const migration112 = readFileSync(MIGRATION_112_PATH, "utf8");
    assert.match(
      migration112,
      /state LIKE N'WAITING_ABSENCE_%' AND intent = N'ABSENCE'/,
    );
  });

  it("lists WAITING_ABSENCE_KIND_SELECTION in migration 152 state constraint", () => {
    const migration152 = readFileSync(MIGRATION_152_PATH, "utf8");
    assert.match(migration152, new RegExp(`N'${NEW_ABSENCE_KIND_STATE}'`));
  });
});

describeDatabaseIntegration("bot session absence kind migrations (database)", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("CK_bot_sessions_intent_state still matches WAITING_ABSENCE_% for ABSENCE intent", async () => {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT definition
      FROM sys.check_constraints
      WHERE name = N'CK_bot_sessions_intent_state'
        AND parent_object_id = OBJECT_ID(N'dbo.bot_sessions')
    `);

    const definition = String(result.recordset[0]?.definition ?? "");
    if (!definition) {
      return;
    }

    assert.match(definition, /WAITING_ABSENCE_%/i);
    assert.match(definition, /ABSENCE/i);
  });

  it("CK_bot_sessions_state includes WAITING_ABSENCE_KIND_SELECTION when migration 152 is applied", async () => {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT definition
      FROM sys.check_constraints
      WHERE name = N'CK_bot_sessions_state'
        AND parent_object_id = OBJECT_ID(N'dbo.bot_sessions')
    `);

    const definition = String(result.recordset[0]?.definition ?? "");
    if (!definition) {
      return;
    }

    if (!definition.includes(NEW_ABSENCE_KIND_STATE)) {
      return;
    }

    assert.match(definition, /WAITING_ABSENCE_KIND_SELECTION/);
  });
});
