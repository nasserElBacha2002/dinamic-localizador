import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import { randomUUID } from "node:crypto";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { getPool } from "../database/connection";
import { whatsappSystemInteractionRepository } from "../repositories/whatsapp-system-interaction.repository";
import { whatsappTurnClassificationRepository } from "../repositories/whatsapp-turn-classification.repository";

describeDatabaseIntegration("whatsapp turn classification SQL concurrency", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("concurrent prepare on same source_key yields one row idempotently", async () => {
    const companyId = randomUUID();
    const employeeId = randomUUID();
    const sourceKey = `attendance_notification:${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 60_000);

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        whatsappSystemInteractionRepository.prepare({
          companyId,
          employeeId,
          category: "ARRIVAL_REMINDER",
          relatedOperationId: null,
          sourceJob: "test",
          sourceKey,
          sourceMessageId: null,
          expiresAt,
        }),
      ),
    );

    const ids = new Set(results.map((r) => r.id));
    assert.equal(ids.size, 1, "all prepares must return the same row id");

    const count = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("sourceKey", sql.NVarChar(120), sourceKey)
      .query(`
        SELECT COUNT(*) AS cnt
        FROM dbo.whatsapp_system_interactions
        WHERE company_id = @companyId AND source_key = @sourceKey;
      `);
    assert.equal(Number(count.recordset[0].cnt), 1);

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`DELETE FROM dbo.whatsapp_system_interactions WHERE company_id = @companyId`);
  });

  it("prepare does not reactivate CONSUMED", async () => {
    const companyId = randomUUID();
    const employeeId = randomUUID();
    const sourceKey = `attendance_notification:${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 60_000);

    const prepared = await whatsappSystemInteractionRepository.prepare({
      companyId,
      employeeId,
      category: "ARRIVAL_REMINDER",
      relatedOperationId: null,
      sourceJob: "test",
      sourceKey,
      sourceMessageId: null,
      expiresAt,
    });
    await whatsappSystemInteractionRepository.markSendAccepted({
      companyId,
      sourceKey,
      providerMessageSid: `SM${randomUUID().replace(/-/g, "").slice(0, 32)}`,
    });
    await whatsappSystemInteractionRepository.markConsumed({
      companyId,
      interactionId: prepared.id,
    });

    const again = await whatsappSystemInteractionRepository.prepare({
      companyId,
      employeeId,
      category: "ARRIVAL_REMINDER",
      relatedOperationId: null,
      sourceJob: "test",
      sourceKey,
      sourceMessageId: null,
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    assert.equal(again.status, "CONSUMED");
    assert.equal(again.expiresAt, prepared.expiresAt);

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`DELETE FROM dbo.whatsapp_system_interactions WHERE company_id = @companyId`);
  });

  it("concurrent classification inserts are idempotent by message_sid", async () => {
    const messageSid = `SM${randomUUID().replace(/-/g, "").slice(0, 30)}`;
    const companyId = randomUUID();
    const employeeId = randomUUID();

    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () =>
        whatsappTurnClassificationRepository.insertIgnoreDuplicate({
          companyId,
          employeeId,
          messageSid,
          messageType: "TEXT",
          origin: "EMPLOYEE",
          classification: "EMPLOYEE_LIMITED",
          category: "LIMITED_HANDLER",
          reasonCode: "RESOLVED_LIMITED_HANDLER",
          ruleVersion: "v3",
          activeSessionIntent: null,
          activeSessionState: null,
          resolvedIntent: "menu",
          resolvedHandler: "MENU",
          relatedOperationId: null,
          systemInteractionId: null,
          causationMessageSid: null,
          classifiedAt: new Date().toISOString(),
        }),
      ),
    );

    assert.equal(outcomes.filter((o) => o.inserted).length, 1);
    assert.equal(outcomes.filter((o) => !o.inserted).length, 7);

    await getPool()
      .request()
      .input("messageSid", sql.NVarChar(64), messageSid)
      .query(`DELETE FROM dbo.whatsapp_turn_classifications WHERE message_sid = @messageSid`);
  });
});
