import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
  requireDinamicCompanyId,
} from "../test-helpers/integration-test";
import { getPool } from "../database/connection";
import { whatsappConversationRepository } from "../repositories/whatsapp-conversation.repository";
import { whatsappProviderEventRepository } from "../repositories/whatsapp-provider-event.repository";
import { whatsappMessageRepository } from "../repositories/whatsapp-message.repository";

describeDatabaseIntegration("whatsapp observability sql concurrency", () => {
  let companyId = "";
  const phoneHash = `test-hash-${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const createdConversationIds: string[] = [];
  const createdMessageIds: string[] = [];
  const createdEventIds: string[] = [];

  before(async () => {
    await setupDatabaseIntegration();
    companyId = await requireDinamicCompanyId();
  });

  after(async () => {
    const pool = getPool();
    for (const id of createdEventIds) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM whatsapp_provider_events WHERE id = @id`);
    }
    for (const id of createdMessageIds) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM whatsapp_messages WHERE id = @id`);
    }
    for (const id of createdConversationIds) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM whatsapp_conversations WHERE id = @id`);
    }
    await teardownDatabaseIntegration();
  });

  it("concurrent resolveOrCreateOpen yields a single open conversation", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        whatsappConversationRepository.resolveOrCreateOpen({
          companyId,
          employeeId: null,
          phoneHash,
          phoneMasked: "+54911******78",
          phoneNormalizedEncrypted: "v1:testciphertext",
        }),
      ),
    );

    const uniqueIds = new Set(results.map((row) => row.id));
    assert.equal(uniqueIds.size, 1);
    createdConversationIds.push(results[0]!.id);

    const pool = getPool();
    const count = await pool
      .request()
      .input("phoneHash", sql.NVarChar(64), phoneHash)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT COUNT(*) AS total
        FROM whatsapp_conversations
        WHERE phone_hash = @phoneHash
          AND company_id = @companyId
          AND status IN (N'ACTIVE', N'WARNING', N'ERROR')
      `);
    assert.equal(Number(count.recordset[0].total), 1);
  });

  it("links orphan provider events when message appears later", async () => {
    const providerMessageSid = `SM${randomUUID().replace(/-/g, "").slice(0, 30)}`;
    const conversation =
      createdConversationIds[0] ??
      (
        await whatsappConversationRepository.resolveOrCreateOpen({
          companyId,
          employeeId: null,
          phoneHash: `${phoneHash}-orphan`,
          phoneMasked: "+54911******99",
          phoneNormalizedEncrypted: "v1:testciphertext2",
        })
      ).id;
    if (!createdConversationIds.includes(conversation)) {
      createdConversationIds.push(conversation);
    }

    const inserted = await whatsappProviderEventRepository.insertIdempotent({
      messageId: null,
      provider: "twilio",
      providerMessageSid,
      providerStatus: "delivered",
      eventType: "STATUS",
      errorCode: null,
      errorMessage: null,
      payloadJsonSanitized: JSON.stringify({ MessageSid: providerMessageSid, MessageStatus: "delivered" }),
      providerCreatedAt: new Date(),
      providerEventKey: `twilio:${providerMessageSid}:delivered:null:null`,
    });
    assert.equal(inserted.created, true);
    if (inserted.event) {
      createdEventIds.push(inserted.event.id);
    }

    const message = await whatsappMessageRepository.create({
      companyId,
      messageSid: providerMessageSid,
      direction: "OUTBOUND",
      employeeId: null,
      phoneFrom: "+5491199999999",
      phoneTo: "+5491112345678",
      messageType: "TEXT",
      body: "test",
      latitude: null,
      longitude: null,
      status: "SENT",
      rawPayload: {},
    });
    assert.ok(message);
    createdMessageIds.push(message!.id);

    const linked = await whatsappProviderEventRepository.linkOrphanedToMessage(
      providerMessageSid,
      message!.id,
    );
    assert.ok(linked >= 1);

    const events = await whatsappProviderEventRepository.listByMessageSid(providerMessageSid);
    assert.ok(events.every((event) => event.messageId === message!.id));
  });
});
