import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
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

const MIGRATION_154_PATH = join(
  process.cwd(),
  "..",
  "database/migrations/154_bot_session_absence_edit_states.sql",
);

const NEW_ABSENCE_KIND_STATE = "WAITING_ABSENCE_KIND_SELECTION";
const ABSENCE_EDIT_STATES = [
  "WAITING_ABSENCE_EDIT_REQUEST_SELECTION",
  "WAITING_ABSENCE_EDIT_FIELD_MENU",
  "WAITING_ABSENCE_EDIT_CONFIRMATION",
  "WAITING_ABSENCE_OVERLAP_PROMPT",
] as const;

const readBotSessionsCheckDefinition = async (
  constraintName: string,
): Promise<string | null> => {
  const result = await getPool()
    .request()
    .input("name", sql.NVarChar(128), constraintName)
    .query(`
      SELECT definition
      FROM sys.check_constraints
      WHERE name = @name
        AND parent_object_id = OBJECT_ID(N'dbo.bot_sessions')
    `);
  const definition = String(result.recordset[0]?.definition ?? "");
  return definition || null;
};

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

  it("lists absence edit states in migration 154 state constraint", () => {
    const migration154 = readFileSync(MIGRATION_154_PATH, "utf8");
    for (const state of ABSENCE_EDIT_STATES) {
      assert.match(migration154, new RegExp(`N'${state}'`));
    }
  });
});

describeDatabaseIntegration("bot session absence kind migrations (database)", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("CK_bot_sessions_intent_state exists and allows WAITING_ABSENCE_% with ABSENCE intent", async () => {
    const definition = await readBotSessionsCheckDefinition("CK_bot_sessions_intent_state");
    assert.ok(
      definition,
      "migration 112 intent/state pairing constraint must be present on integration database",
    );
    assert.match(definition, /WAITING_ABSENCE_%/i);
    assert.match(definition, /ABSENCE/i);
  });

  it("CK_bot_sessions_state exists and includes WAITING_ABSENCE_KIND_SELECTION after migration 152", async () => {
    const definition = await readBotSessionsCheckDefinition("CK_bot_sessions_state");
    assert.ok(definition, "CK_bot_sessions_state must exist on integration database");
    assert.match(
      definition,
      /WAITING_ABSENCE_KIND_SELECTION/,
      "migration 152 must be applied on integration database",
    );
  });

  it("CK_bot_sessions_state includes absence edit states after migration 154", async () => {
    const definition = await readBotSessionsCheckDefinition("CK_bot_sessions_state");
    assert.ok(definition, "CK_bot_sessions_state must exist on integration database");
    assert.match(
      definition,
      /WAITING_ABSENCE_EDIT_FIELD_MENU/,
      "migration 154 must be applied on integration database",
    );
    for (const state of ABSENCE_EDIT_STATES) {
      assert.match(definition, new RegExp(state));
    }
  });
});
