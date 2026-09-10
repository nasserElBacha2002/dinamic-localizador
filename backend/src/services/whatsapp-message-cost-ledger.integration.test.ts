import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { randomUUID } from "node:crypto";
import { getPool } from "../database/connection";
import { whatsappMessageCostLedgerClaimRepository } from "../repositories/whatsapp-message-cost-ledger-claim.repository";
import { whatsappMessageCostLedgerWriteRepository } from "../repositories/whatsapp-message-cost-ledger-write.repository";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
  requireDinamicCompanyId,
} from "../test-helpers/integration-test";

describeDatabaseIntegration("whatsapp message cost ledger SQL", () => {
  let companyId = "";
  const ledgerIds: string[] = [];

  before(async () => {
    await setupDatabaseIntegration();
    companyId = await requireDinamicCompanyId();
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

  it("enforces unique provider_message_sid under concurrent inserts", async () => {
    const sid = `SM${randomUUID().replace(/-/g, "").slice(0, 30)}`;
    const insertOnce = () =>
      whatsappMessageCostLedgerWriteRepository.insertIgnoreDuplicate({
        companyId,
        providerMessageSid: sid,
        direction: "OUTBOUND",
        sentAt: new Date(),
        recipientPhoneMasked: "+54911******11",
        messageKind: "TEMPLATE",
        costQuality: "PENDING",
        costSource: "NONE",
        nextSyncAt: new Date(),
      });

    const [a, b] = await Promise.all([insertOnce(), insertOnce()]);
    const created = [a, b].filter(Boolean) as string[];
    assert.equal(created.length, 1);
    ledgerIds.push(...created);

    const pool = getPool();
    const count = await pool
      .request()
      .input("sid", sql.NVarChar(100), sid)
      .query(
        `SELECT COUNT(*) AS c FROM dbo.whatsapp_message_cost_ledger WHERE provider_message_sid = @sid`,
      );
    assert.equal(Number(count.recordset[0].c), 1);
  });

  it("only one worker claim wins concurrently for the same due row set", async () => {
    const sid = `SM${randomUUID().replace(/-/g, "").slice(0, 30)}`;
    const id = await whatsappMessageCostLedgerWriteRepository.insertIgnoreDuplicate({
      companyId,
      providerMessageSid: sid,
      direction: "OUTBOUND",
      sentAt: new Date(),
      recipientPhoneMasked: "+54911******11",
      messageKind: "TEXT",
      costQuality: "PENDING",
      costSource: "NONE",
      nextSyncAt: new Date("1970-01-01T00:00:00.000Z"),
    });
    assert.ok(id);
    ledgerIds.push(id!);

    const pool = getPool();
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        UPDATE dbo.whatsapp_message_cost_ledger
        SET next_sync_at = '1970-01-01T00:00:00.000',
            sync_attempt_count = 0,
            lease_owner = NULL,
            lease_expires_at = NULL
        WHERE id = @id
      `);

    const claims = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        whatsappMessageCostLedgerClaimRepository.claimNextPending(`w${i}-${randomUUID()}`, 120, 8),
      ),
    );
    const claimedThis = claims.filter((row) => row && row.id === id);
    assert.equal(claimedThis.length, 1);
  });

  it("resync does not steal an active lease", async () => {
    const sid = `SM${randomUUID().replace(/-/g, "").slice(0, 30)}`;
    const id = await whatsappMessageCostLedgerWriteRepository.insertIgnoreDuplicate({
      companyId,
      providerMessageSid: sid,
      direction: "OUTBOUND",
      sentAt: new Date(),
      recipientPhoneMasked: "+54911******11",
      messageKind: "TEXT",
      costQuality: "PENDING",
      costSource: "NONE",
      nextSyncAt: new Date(),
    });
    assert.ok(id);
    ledgerIds.push(id!);

    const workerId = `w-lease-${randomUUID()}`;
    const claimed = await whatsappMessageCostLedgerClaimRepository.claimNextPending(
      workerId,
      600,
      8,
    );
    assert.ok(claimed);
    assert.equal(claimed!.id, id);

    const now = new Date();
    const updated = await whatsappMessageCostLedgerClaimRepository.requestResync({
      companyId,
      monthStartUtc: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      nextMonthStartUtc: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
      ledgerIds: [id!],
      maxRows: 10,
    });
    assert.equal(updated, 0);

    const row = await whatsappMessageCostLedgerWriteRepository.getById(id!);
    assert.equal(row?.leaseOwner, workerId);
  });

  it("applies provider status monotonically", async () => {
    const sid = `SM${randomUUID().replace(/-/g, "").slice(0, 30)}`;
    const id = await whatsappMessageCostLedgerWriteRepository.insertIgnoreDuplicate({
      companyId,
      providerMessageSid: sid,
      direction: "OUTBOUND",
      sentAt: new Date(),
      recipientPhoneMasked: "+54911******11",
      messageKind: "TEXT",
      providerStatus: "sent",
      costQuality: "PENDING",
      costSource: "NONE",
      nextSyncAt: new Date(),
    });
    assert.ok(id);
    ledgerIds.push(id!);

    await whatsappMessageCostLedgerWriteRepository.updateProviderStatusBySid({
      providerMessageSid: sid,
      providerStatus: "delivered",
    });
    await whatsappMessageCostLedgerWriteRepository.updateProviderStatusBySid({
      providerMessageSid: sid,
      providerStatus: "sent",
    });
    const row = await whatsappMessageCostLedgerWriteRepository.getById(id!);
    assert.equal(row?.providerStatus, "delivered");
  });
});
