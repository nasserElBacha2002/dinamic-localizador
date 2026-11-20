import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { randomUUID } from "node:crypto";
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

describeDatabaseIntegration("whatsapp SERVICE month rank (SQL Server)", () => {
  let companyId = "";
  const ledgerIds: string[] = [];
  let migrationReady = false;

  before(async () => {
    await setupDatabaseIntegration();
    companyId = await requireDinamicCompanyId();
    const pool = getPool();
    const col = await pool.request().query(`
      SELECT COL_LENGTH(OBJECT_ID(N'dbo.whatsapp_message_cost_ledger'), N'sender_billing_key') AS sender_billing_key
    `);
    migrationReady = col.recordset[0]?.sender_billing_key !== null;
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

  it("assigns unique deterministic ranks under concurrent recompute", async (t) => {
    if (!migrationReady) {
      t.skip("migration 171 columns not present");
      return;
    }

    const senderE164 = "whatsapp:+14155552671";
    const senderBillingKey = buildSenderBillingKey(senderE164);
    assert.ok(senderBillingKey);

    const sentAt = new Date("2026-10-20T15:00:00.000Z");
    const bounds = getMonthUtcBounds(2026, 10, env.BOT_OPERATION_TIMEZONE);

    const ids: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const sid = `SM${randomUUID().replace(/-/g, "").slice(0, 30)}`;
      const id = await whatsappMessageCostLedgerWriteRepository.insertIgnoreDuplicate({
        companyId,
        providerMessageSid: sid,
        direction: "OUTBOUND",
        sentAt: new Date(sentAt.getTime() + i * 1_000),
        recipientPhoneMasked: "+54911******11",
        senderPhoneMasked: "+1415******71",
        senderBillingKey,
        metaCswOpen: true,
        destinationCountryCode: "AR",
        messageKind: "BOT_TWIML",
        metaBillingCategory: "SERVICE",
        metaCostQuality: "PENDING",
        metaCostSource: "NONE",
        costQuality: "UNAVAILABLE",
        costSource: "NONE",
      });
      assert.ok(id);
      ids.push(id!);
      ledgerIds.push(id!);
    }

    await whatsappMessageCostServiceMonthService.recomputeRanksAndRepriceSenderMonth({
      senderBillingKey: senderBillingKey!,
      monthStartUtc: bounds.monthStartUtc,
      nextMonthStartUtc: bounds.nextMonthStartUtc,
      preserveClassification: true,
    });

    const pool = getPool();
    const stored = await pool.request().input("sender", sql.NVarChar(64), senderBillingKey).query(`
      SELECT service_month_rank
      FROM dbo.whatsapp_message_cost_ledger
      WHERE sender_billing_key = @sender
        AND meta_billing_category = N'SERVICE'
      ORDER BY service_month_rank ASC
    `);
    assert.equal(stored.recordset.length, ids.length);
    for (let i = 0; i < stored.recordset.length; i += 1) {
      assert.equal(Number(stored.recordset[i].service_month_rank), i + 1);
    }
  });

  it("late insert before former rank 1001 shifts quota pricing", async (t) => {
    if (!migrationReady) {
      t.skip("migration 171 columns not present");
      return;
    }

    const senderBillingKey = buildSenderBillingKey("whatsapp:+14155552777");
    assert.ok(senderBillingKey);
    const bounds = getMonthUtcBounds(2026, 10, env.BOT_OPERATION_TIMEZONE);
    const baseSent = new Date("2026-10-18T10:00:00.000Z").getTime();

    const firstThousandIds: string[] = [];
    for (let i = 0; i < 1000; i += 1) {
      const id = await whatsappMessageCostLedgerWriteRepository.insertIgnoreDuplicate({
        companyId,
        providerMessageSid: `SM${randomUUID().replace(/-/g, "").slice(0, 30)}`,
        direction: "OUTBOUND",
        sentAt: new Date(baseSent + i * 10),
        recipientPhoneMasked: "+54911******11",
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
      firstThousandIds.push(id!);
      ledgerIds.push(id!);
    }

    await whatsappMessageCostServiceMonthService.recomputeRanksAndRepriceSenderMonth({
      senderBillingKey: senderBillingKey!,
      monthStartUtc: bounds.monthStartUtc,
      nextMonthStartUtc: bounds.nextMonthStartUtc,
      focusId: firstThousandIds[999],
      preserveClassification: true,
    });

    const lateId = await whatsappMessageCostLedgerWriteRepository.insertIgnoreDuplicate({
      companyId,
      providerMessageSid: `SM${randomUUID().replace(/-/g, "").slice(0, 30)}`,
      direction: "OUTBOUND",
      sentAt: new Date(baseSent + 999 * 10 - 5),
      recipientPhoneMasked: "+54911******11",
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
    assert.ok(lateId);
    ledgerIds.push(lateId!);

    await whatsappMessageCostServiceMonthService.recomputeRanksAndRepriceSenderMonth({
      senderBillingKey: senderBillingKey!,
      monthStartUtc: bounds.monthStartUtc,
      nextMonthStartUtc: bounds.nextMonthStartUtc,
      focusId: lateId!,
      preserveClassification: true,
    });

    const pool = getPool();
    const formerThousand = await pool
      .request()
      .input("id", sql.UniqueIdentifier, firstThousandIds[999])
      .query(`SELECT service_month_rank, meta_cost_note FROM dbo.whatsapp_message_cost_ledger WHERE id = @id`);
    assert.equal(Number(formerThousand.recordset[0].service_month_rank), 1001);
    assert.equal(String(formerThousand.recordset[0].meta_cost_note), "SERVICE_ABOVE_FREE_TIER");
  });
});