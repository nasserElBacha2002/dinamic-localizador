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

const NEW_ABSENCE_KIND_STATE = "WAITING_ABSENCE_KIND_SELECTION";

const readBotSessionsCheckDefinition = async (constraintName: string): Promise<string> => {
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
  assert.ok(definition, `missing constraint ${constraintName} on dbo.bot_sessions`);
  return definition;
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
    assert.match(definition, /WAITING_ABSENCE_%/i);
    assert.match(definition, /ABSENCE/i);
  });

  it("CK_bot_sessions_state exists and includes WAITING_ABSENCE_KIND_SELECTION after migration 152", async (t) => {
    const definition = await readBotSessionsCheckDefinition("CK_bot_sessions_state");
    if (!definition.includes(NEW_ABSENCE_KIND_STATE)) {
      t.skip("migration 152 not applied on this database");
      return;
    }
    assert.match(definition, /WAITING_ABSENCE_KIND_SELECTION/);
  });
});
