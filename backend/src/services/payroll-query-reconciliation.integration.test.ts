import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import { AppError } from "../errors/app-error";
import { getPool } from "../database/connection";
import { payrollReceiptQueryDeliveryRepository } from "../repositories/payroll-receipt-query-delivery.repository";
import { setAuditBeforeInsertHookForTests } from "../repositories/audit.repository";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { payrollQueryReconciliationService } from "./payroll-query-reconciliation.service";

describeDatabaseIntegration("payroll query reconciliation sql", () => {
  const deliveryIds: string[] = [];
  const sessionIds: string[] = [];
  const receiptIds: string[] = [];
  const batchIds: string[] = [];
  let companyId = "";
  let employeeId = "";
  let userId = "";

  before(async () => {
    await setupDatabaseIntegration();
    const company = await getPool().request().query(`
      SELECT TOP (1) id FROM dbo.companies WHERE status = N'ACTIVE' ORDER BY created_at
    `);
    const user = await getPool().request().query(`
      SELECT TOP (1) id FROM dbo.users WHERE active = 1 ORDER BY created_at
    `);
    companyId = String(company.recordset[0]?.id ?? "");
    userId = String(user.recordset[0]?.id ?? "");
    assert.ok(companyId && userId, "active company and user required");
    const employee = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), "Payroll reconciliation test")
      .input("phone", sql.NVarChar(30), `+54911${Date.now().toString().slice(-8)}`)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO dbo.employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, @phone, N'fijo', 1);
        SELECT id FROM @inserted;
      `);
    employeeId = String(employee.recordset[0].id);
  });

  after(async () => {
    setAuditBeforeInsertHookForTests(undefined);
    for (const deliveryId of deliveryIds) {
      await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("deliveryId", sql.UniqueIdentifier, deliveryId)
        .query(`
          DELETE FROM dbo.audit_logs
          WHERE company_id = @companyId AND entity_id = @deliveryId;
          DELETE FROM dbo.whatsapp_payroll_receipt_query_deliveries
          WHERE company_id = @companyId AND id = @deliveryId;
        `);
    }
    for (const sessionId of sessionIds) {
      await getPool()
        .request()
        .input("id", sql.UniqueIdentifier, sessionId)
        .query(`DELETE FROM dbo.bot_sessions WHERE id = @id`);
    }
    for (const receiptId of receiptIds) {
      await getPool()
        .request()
        .input("id", sql.UniqueIdentifier, receiptId)
        .query(`
          DELETE FROM dbo.whatsapp_payroll_receipt_notifications WHERE payroll_receipt_id = @id;
          DELETE FROM dbo.payroll_receipts WHERE id = @id;
        `);
    }
    for (const batchId of batchIds) {
      await getPool()
        .request()
        .input("id", sql.UniqueIdentifier, batchId)
        .query(`DELETE FROM dbo.payroll_receipt_batches WHERE id = @id`);
    }
    if (employeeId) {
      await getPool()
        .request()
        .input("id", sql.UniqueIdentifier, employeeId)
        .query(`DELETE FROM dbo.employees WHERE id = @id`);
    }
    await teardownDatabaseIntegration();
  });

  const createAmbiguousDelivery = async (): Promise<{
    deliveryId: string;
    sessionId: string;
    receiptId: string;
    year: number;
    month: number;
  }> => {
    const deliveryId = randomUUID();
    const sessionId = randomUUID();
    const receiptId = randomUUID();
    const batchId = randomUUID();
    deliveryIds.push(deliveryId);
    sessionIds.push(sessionId);
    receiptIds.push(receiptId);
    batchIds.push(batchId);
    const year = 2190;
    const month = 11;
    await getPool()
      .request()
      .input("deliveryId", sql.UniqueIdentifier, deliveryId)
      .input("sessionId", sql.UniqueIdentifier, sessionId)
      .input("receiptId", sql.UniqueIdentifier, receiptId)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("year", sql.Int, year)
      .input("month", sql.Int, month)
      .query(`
        INSERT INTO dbo.payroll_receipt_batches
          (id, company_id, year, month, status, total_files)
        VALUES (@batchId, @companyId, @year, @month, N'COMPLETED', 1);

        INSERT INTO dbo.payroll_receipts (
          id, company_id, batch_id, employee_id, year, month,
          original_filename, storage_provider, storage_object_key, status
        )
        VALUES (
          @receiptId, @companyId, @batchId, @employeeId, @year, @month,
          N'reconcile.pdf', N'GOOGLE_CLOUD_STORAGE', N'test/reconcile.pdf', N'ASSOCIATED'
        );

        INSERT INTO dbo.bot_sessions (
          id, company_id, employee_id, phone_number, state, intent,
          context_json, expires_at, is_simulation, session_version
        )
        VALUES (
          @sessionId, @companyId, @employeeId, N'+5491100000000', N'COMPLETED', NULL,
          NULL, DATEADD(hour, 1, SYSUTCDATETIME()), 0, 0
        );

        INSERT INTO dbo.whatsapp_payroll_receipt_query_deliveries (
          id, company_id, bot_session_id, payroll_receipt_id, employee_id,
          year, month, status, processing_version, reconciliation_required_at
        )
        VALUES (
          @deliveryId, @companyId, @sessionId, @receiptId, @employeeId,
          @year, @month, N'RECONCILIATION_REQUIRED', 2, SYSUTCDATETIME()
        );
      `);
    return { deliveryId, sessionId, receiptId, year, month };
  };

  it("resolves accepted idempotently and fences stale commands", async () => {
    const row = await createAmbiguousDelivery();
    const commandId = randomUUID();
    const input = {
      companyId,
      deliveryId: row.deliveryId,
      commandId,
      expectedProcessingVersion: 2,
      resolution: "CONFIRMED_ACCEPTED" as const,
      reason: "Verified provider acceptance",
      providerMessageSid: `SM${randomUUID().replaceAll("-", "")}`,
      userId,
    };
    const first = await payrollQueryReconciliationService.reconcile(input);
    const replay = await payrollQueryReconciliationService.reconcile(input);
    assert.equal(first.status, "ACCEPTED");
    assert.equal(replay.reconciliationCommandId?.toLowerCase(), commandId.toLowerCase());
    await assert.rejects(
      payrollQueryReconciliationService.reconcile({
        ...input,
        commandId: randomUUID(),
      }),
      (error) => error instanceof AppError && error.statusCode === 409,
    );
  });

  it("makes a confirmed-not-sent row claimable exactly once", async () => {
    const row = await createAmbiguousDelivery();
    await payrollQueryReconciliationService.reconcile({
      companyId,
      deliveryId: row.deliveryId,
      commandId: randomUUID(),
      expectedProcessingVersion: 2,
      resolution: "CONFIRMED_NOT_SENT",
      reason: "Provider confirms no message was created",
      providerMessageSid: null,
      userId,
    });
    const key = {
      companyId,
      botSessionId: row.sessionId,
      employeeId,
      year: row.year,
      month: row.month,
      payrollReceiptId: row.receiptId,
      leaseMs: 60_000,
    };
    assert.ok(await payrollReceiptQueryDeliveryRepository.claimForSend(key));
    assert.equal(await payrollReceiptQueryDeliveryRepository.claimForSend(key), null);
  });

  it("rolls back resolution when critical audit persistence fails", async () => {
    const row = await createAmbiguousDelivery();
    setAuditBeforeInsertHookForTests(async (input) => {
      if (input.action === "PAYROLL_QUERY_DELIVERY_RECONCILED") {
        throw new Error("forced audit failure");
      }
    });
    await assert.rejects(
      payrollQueryReconciliationService.reconcile({
        companyId,
        deliveryId: row.deliveryId,
        commandId: randomUUID(),
        expectedProcessingVersion: 2,
        resolution: "CONFIRMED_NOT_SENT",
        reason: "Provider confirms no message was created",
        providerMessageSid: null,
        userId,
      }),
      /forced audit failure/,
    );
    setAuditBeforeInsertHookForTests(undefined);
    const current = await payrollReceiptQueryDeliveryRepository.findForReconciliation(
      companyId,
      row.deliveryId,
    );
    assert.equal(current?.status, "RECONCILIATION_REQUIRED");
    assert.equal(current?.processingVersion, 2);
  });
});
