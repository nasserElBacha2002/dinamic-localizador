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
import { whatsappObservabilityRepository } from "../repositories/whatsapp-observability.repository";

describeDatabaseIntegration("whatsapp observability message cursor pagination", () => {
  let companyId = "";
  const phoneHash = `cursor-hash-${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const createdConversationIds: string[] = [];
  const createdMessageIds: string[] = [];

  before(async () => {
    await setupDatabaseIntegration();
    companyId = await requireDinamicCompanyId();
  });

  after(async () => {
    const pool = getPool();
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

  async function insertMessage(input: {
    conversationId: string;
    body: string;
    direction: "INBOUND" | "OUTBOUND";
    createdAt: Date;
    id?: string;
  }): Promise<string> {
    const pool = getPool();
    const id = (input.id ?? randomUUID()).toLowerCase();
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("conversationId", sql.UniqueIdentifier, input.conversationId)
      .input("direction", sql.NVarChar(20), input.direction)
      .input("phoneFrom", sql.NVarChar(30), "+5491111111111")
      .input("phoneTo", sql.NVarChar(30), "+5491199999999")
      .input("messageType", sql.NVarChar(30), "TEXT")
      .input("body", sql.NVarChar(sql.MAX), input.body)
      .input("createdAt", sql.DateTime2, input.createdAt)
      .query(`
        INSERT INTO whatsapp_messages (
          id, company_id, conversation_id, direction, phone_from, phone_to,
          message_type, body, created_at
        )
        VALUES (
          @id, @companyId, @conversationId, @direction, @phoneFrom, @phoneTo,
          @messageType, @body, @createdAt
        )
      `);
    createdMessageIds.push(id);
    return id;
  }

  it("pages 120 messages with cursor without omissions, including concurrent inserts", async () => {
    const conversation = await whatsappConversationRepository.resolveOrCreateOpen({
      companyId,
      employeeId: null,
      phoneHash,
      phoneMasked: "+54911******55",
      phoneNormalizedEncrypted: "v1:cursor-ciphertext",
    });
    createdConversationIds.push(conversation.id);

    const insertedIds: string[] = [];
    for (let n = 1; n <= 120; n += 1) {
      const id = await insertMessage({
        conversationId: conversation.id,
        body: `msg-${n}`,
        direction: n % 2 === 0 ? "OUTBOUND" : "INBOUND",
        createdAt: new Date(Date.UTC(2026, 2, 1, 0, 0, n)),
      });
      insertedIds.push(id);
    }

    const collected = new Set<string>();
    let cursor: { createdAt: string; id: string } | null = null;
    let pages = 0;
    do {
      const page = await whatsappObservabilityRepository.listMessages(conversation.id, {
        limit: 50,
        beforeCreatedAt: cursor?.createdAt,
        beforeId: cursor?.id,
      });
      pages += 1;
      for (const message of page.data) {
        collected.add(message.id.toLowerCase());
      }
      if (pages === 1) {
        for (let n = 1; n <= 10; n += 1) {
          await insertMessage({
            conversationId: conversation.id,
            body: `msg-new-${n}`,
            direction: "INBOUND",
            createdAt: new Date(Date.UTC(2026, 2, 2, 0, 0, n)),
          });
        }
      }
      cursor = page.nextCursor;
      assert.equal(page.hasMore, cursor !== null);
      assert.ok(pages <= 5, "pagination should terminate");
    } while (cursor);

    assert.equal(pages, 3);
    assert.equal(collected.size, 120);
    for (const id of insertedIds) {
      assert.equal(collected.has(id.toLowerCase()), true, `missing ${id}`);
    }
  });

  it("orders deterministically for equal timestamps and supports direction filter", async () => {
    const conversation = await whatsappConversationRepository.resolveOrCreateOpen({
      companyId,
      employeeId: null,
      phoneHash: `${phoneHash}-ties`,
      phoneMasked: "+54911******66",
      phoneNormalizedEncrypted: "v1:cursor-ciphertext-ties",
    });
    createdConversationIds.push(conversation.id);

    const sameTs = new Date(Date.UTC(2026, 3, 1, 15, 0, 0));
    const idA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const idB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const idC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await insertMessage({
      conversationId: conversation.id,
      body: "tie-a",
      direction: "INBOUND",
      createdAt: sameTs,
      id: idA,
    });
    await insertMessage({
      conversationId: conversation.id,
      body: "tie-b",
      direction: "OUTBOUND",
      createdAt: sameTs,
      id: idB,
    });
    await insertMessage({
      conversationId: conversation.id,
      body: "tie-c",
      direction: "INBOUND",
      createdAt: sameTs,
      id: idC,
    });

    const all = await whatsappObservabilityRepository.listMessages(conversation.id, {
      limit: 10,
    });
    assert.deepEqual(
      all.data.map((m) => m.id.toLowerCase()),
      [idA, idB, idC],
    );

    const inbound = await whatsappObservabilityRepository.listMessages(conversation.id, {
      limit: 10,
      direction: "INBOUND",
    });
    assert.deepEqual(
      inbound.data.map((m) => m.body),
      ["tie-a", "tie-c"],
    );
  });
});
