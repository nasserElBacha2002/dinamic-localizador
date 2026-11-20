import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { getPool } from "../../database/connection";
import { env } from "../../config/env";
import { whatsappMessageCostLedgerWriteRepository } from "../../repositories/whatsapp/whatsapp-message-cost-ledger-write.repository";
import { whatsappMessageCostServiceMonthService } from "./whatsapp-message-cost-service-month.service";
import { buildSenderBillingKey } from "../../utils/whatsapp/whatsapp-sender-billing-key";
import { getMonthUtcBounds } from "../../utils/month-utc-bounds";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
  requireDinamicCompanyId,
} from "../../test-helpers/integration-test";

const ROW_COUNT = 5_000;
const MAX_RECOMPUTE_MS = 120_000;

describeDatabaseIntegration("SERVICE month recompute performance", () => {
  let companyId = "";
  const ledgerIds: string[] = [];
  let migrationReady = false;
  let senderBillingKey: string | null = null;

  before(async () => {
    await setupDatabaseIntegration();
    companyId = await requireDinamicCompanyId();
    const pool = getPool();
    const col = await pool.request().query(`
      SELECT COL_LENGTH(OBJECT_ID(N'dbo.whatsapp_message_cost_ledger'), N'sender_billing_key') AS sender_billing_key
    `);
    migrationReady = col.recordset[0]?.sender_billing_key !== null;
    senderBillingKey = buildSenderBillingKey("whatsapp:+14155559000");
  });

  after(async () => {
    const pool = getPool();
    for (const id of ledgerIds) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM dbo.whatsapp_message_cost_ledger WHERE id = @id`);
    }
    await teardownDatabaseIntegration();
  });

  it(`recomputes ranks and reprices from rank 4500 on ${ROW_COUNT} rows within budget`, async (t) => {
    if (!migrationReady || !senderBillingKey) {
      t.skip("migration 171 columns not present");
      return;
    }

    const sentAt = new Date("2026-10-20T12:00:00.000Z");
    const bounds = getMonthUtcBounds(2026, 10, env.BOT_OPERATION_TIMEZONE);
    const baseMs = sentAt.getTime();

    for (let i = 0; i < ROW_COUNT; i += 1) {
      const sid = `SM${randomUUID().replace(/-/g, "").slice(0, 30)}`;
      const id = await whatsappMessageCostLedgerWriteRepository.insertIgnoreDuplicate({
        companyId,
        providerMessageSid: sid,
        direction: "OUTBOUND",
        sentAt: new Date(baseMs + i),
        recipientPhoneMasked: "+54911******11",
        senderPhoneMasked: "+1415******00",
        senderBillingKey,
        metaCswOpen: true,
        destinationCountryCode: "AR",
        messageKind: "BOT_TWIML",
        metaBillingCategory: "SERVICE",
        metaCostQuality: "PENDING",
        metaCostSource: "NONE",
        costQuality: "UNAVAILABLE",
        costSource: "NONE",
        providerStatus: "delivered",
      });
      assert.ok(id);
      ledgerIds.push(id!);
    }

    const focusId = ledgerIds[4499];
    const started = performance.now();
    await whatsappMessageCostServiceMonthService.recomputeRanksAndRepriceSenderMonth({
      senderBillingKey,
      monthStartUtc: bounds.monthStartUtc,
      nextMonthStartUtc: bounds.nextMonthStartUtc,
      focusId,
      preserveClassification: true,
    });
    const elapsedMs = performance.now() - started;
    assert.ok(
      elapsedMs < MAX_RECOMPUTE_MS,
      `recompute exceeded budget: ${elapsedMs.toFixed(0)}ms > ${MAX_RECOMPUTE_MS}ms`,
    );

    const pool = getPool();
    const row = await pool
      .request()
      .input("id", sql.UniqueIdentifier, focusId)
      .query(`SELECT service_month_rank, meta_cost_note, meta_price_amount FROM dbo.whatsapp_message_cost_ledger WHERE id = @id`);
    assert.equal(Number(row.recordset[0].service_month_rank), 4500);
    assert.equal(String(row.recordset[0].meta_cost_note), "SERVICE_FREE_TIER");
  });
});