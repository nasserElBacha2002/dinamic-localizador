import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const readMigration = (relativePath: string): string =>
  readFileSync(join(process.cwd(), "../database/migrations", relativePath), "utf8");

describe("contextual bot migrations", () => {
  const migration112 = readMigration("112_contextual_bot_sessions.sql");
  const rollback112 = readMigration("rollback/112_contextual_bot_sessions_rollback.sql");
  const migration113 = readMigration("113_payroll_query_delivery_claims.sql");
  const rollback113 = readMigration("rollback/113_payroll_query_delivery_claims_rollback.sql");
  const migration114 = readMigration("114_payroll_query_reconciliation.sql");

  it("normalizes only identities protected by the active-session indexes", () => {
    assert.match(
      migration112,
      /is_simulation = 0\s+OR \(is_simulation = 1 AND simulation_session_id IS NOT NULL\)/,
    );
    assert.match(migration112, /ORDER BY created_at DESC, id DESC/);
  });

  it("restores both pre-menu active-session indexes on rollback", () => {
    const productionIndex = rollback112.match(
      /CREATE UNIQUE INDEX UX_bot_sessions_active_employee[\s\S]*?\);/,
    )?.[0];
    const simulationIndex = rollback112.match(
      /CREATE UNIQUE INDEX UX_bot_sessions_active_simulation[\s\S]*?\);/,
    )?.[0];
    assert.ok(productionIndex);
    assert.ok(simulationIndex);
    for (const definition of [productionIndex, simulationIndex]) {
      assert.match(definition, /WAITING_OPERATION_SELECTION/);
      assert.match(definition, /WAITING_PAYROLL_RECEIPT_PERIOD/);
      assert.doesNotMatch(definition, /WAITING_MENU_SELECTION/);
      assert.doesNotMatch(definition, /WAITING_INVENTORY_SELECTION/);
    }
  });

  it("keeps payroll claim migration independent of a database name", () => {
    assert.doesNotMatch(migration113, /\bUSE\s+/i);
    assert.doesNotMatch(rollback113, /\bUSE\s+/i);
  });

  it("refuses rollback while ambiguous sends remain", () => {
    assert.match(
      rollback113,
      /status IN \(N'SEND_STARTED', N'RECONCILIATION_REQUIRED'\)[\s\S]*THROW 50113/,
    );
    assert.match(rollback113, /WHERE status = N'PROCESSING'/);
  });

  it("adds tenant-scoped, idempotent reconciliation evidence", () => {
    assert.match(migration114, /UX_wprqd_reconciliation_command/);
    assert.match(migration114, /FOREIGN KEY \(company_id, bot_session_id\)/);
    assert.match(migration114, /CONFIRMED_ACCEPTED/);
    assert.match(migration114, /CONFIRMED_NOT_SENT/);
  });
});
