import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("phase3-4 sql performance source guards", () => {
  it("absence claim short-circuits idle empty retries", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/repositories/absence-workday-sync-job.repository.ts"),
      "utf8",
    );
    assert.match(source, /hasClaimablePending/);
    assert.match(source, /stillClaimable/);
    assert.doesNotMatch(
      source,
      /Retry a few times when the queue still has claimable work\.\n\s*const maxClaimAttempts = 5;\n[\s\S]*if \(attempt \+ 1 < maxClaimAttempts\) \{\n\s*continue;/,
    );
  });

  it("cost sync heartbeat skips redundant singleton UPDATE", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/repositories/whatsapp-message-cost-ledger-query.repository.ts"),
      "utf8",
    );
    assert.match(source, /COST_SYNC_HEARTBEAT_TOUCH_MINUTES/);
    assert.match(source, /last_result_json <> @resultJson/);
    assert.match(source, /DATEADD\(MINUTE, -@touchMinutes, SYSUTCDATETIME\(\)\)/);
  });

  it("cost reconcile uses sargable SID anti-join branches", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/services/whatsapp-message-cost-reconcile.service.ts"),
      "utf8",
    );
    assert.match(source, /l\.provider_message_sid = m\.provider_message_sid/);
    assert.match(source, /l\.provider_message_sid = m\.message_sid/);
    assert.doesNotMatch(
      source,
      /l\.provider_message_sid = COALESCE\(m\.provider_message_sid, m\.message_sid\)/,
    );
  });

  it("cost sync job cools down empty reconcile scans", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/jobs/whatsapp-message-cost-sync.job.ts"),
      "utf8",
    );
    assert.match(source, /COST_RECONCILE_EMPTY_COOLDOWN_MS/);
    assert.match(source, /reconcileSkipped/);
  });

  it("attendance reminders probe SENT_RECOVERY before per-company UPDATE", () => {
    const service = readFileSync(
      resolve(process.cwd(), "src/services/attendance-reminder.service.ts"),
      "utf8",
    );
    const repo = readFileSync(
      resolve(process.cwd(), "src/repositories/attendance-notification.repository.ts"),
      "utf8",
    );
    assert.match(repo, /hasAnySentRecoveryRequired/);
    assert.match(service, /hasAnySentRecoveryRequired/);
    assert.match(service, /reconcileRecovery: anyRecovery/);
  });

  it("missing checkout predicates keep expected_end_at sargable", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/repositories/admin-dynamic-attendance-alert.repository.ts"),
      "utf8",
    );
    assert.match(
      source,
      /ow\.expected_end_at\s*<=\s*DATEADD\(MINUTE, -cs\.admin_missing_checkout_delay_minutes, @referenceAt\)/,
    );
    assert.doesNotMatch(
      source,
      /DATEADD\(MINUTE, cs\.admin_missing_checkout_delay_minutes, ow\.expected_end_at\)\s*<=\s*@referenceAt/,
    );
  });

  it("migration 151 creates only justified narrow indexes", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "../database/migrations/151_phase3_4_sql_performance_indexes.sql",
      ),
      "utf8",
    );
    assert.match(migration, /IX_wm_outbound_sent_at/);
    assert.match(migration, /IX_wan_company_sent_recovery/);
    assert.match(migration, /IX_wc_active_last_activity/);
    assert.match(migration, /IX_wfe_started_unfinished/);
    assert.match(migration, /WHERE direction = N'OUTBOUND'/);
    assert.match(migration, /WHERE status = N'SENT_RECOVERY_REQUIRED'/);
    assert.doesNotMatch(migration, /DROP INDEX/);
    assert.doesNotMatch(migration, /UPDATE STATISTICS/);
    assert.doesNotMatch(migration, /SHRINK/);
  });
});
