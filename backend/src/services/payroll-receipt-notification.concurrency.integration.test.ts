/**
 * Payroll receipt WhatsApp notification — SQL concurrency / lease evidence.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 *
 * Requires:
 * - TEST_COMPANY_ID + TEST_EMPLOYEE_ID (same company), or helpers will resolve Dinamic company
 * - Migration 083 applied (whatsapp_payroll_receipt_notifications)
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { payrollReceiptNotificationRepository } from "../repositories/payroll-receipt-notification.repository";

const companyId = process.env.TEST_COMPANY_ID;
const employeeId = process.env.TEST_EMPLOYEE_ID;

describeDatabaseIntegration("payroll receipt notification sql concurrency", () => {
  const receiptIds: string[] = [];
  const batchIds: string[] = [];

  before(async () => {
    await setupDatabaseIntegration();
    assert.ok(companyId, "TEST_COMPANY_ID is required");
    assert.ok(employeeId, "TEST_EMPLOYEE_ID is required");
  });

  after(async () => {
    const { getPool } = await import("../database/connection");
    const pool = getPool();
    for (const receiptId of receiptIds) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, receiptId)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          DELETE FROM whatsapp_payroll_receipt_notifications
          WHERE payroll_receipt_id = @id AND company_id = @companyId;
          DELETE FROM payroll_receipts WHERE id = @id AND company_id = @companyId;
        `);
    }
    for (const batchId of batchIds) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, batchId)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`DELETE FROM payroll_receipt_batches WHERE id = @id AND company_id = @companyId`);
    }
    await teardownDatabaseIntegration();
  });

  const insertAssociatedReceipt = async (): Promise<string> => {
    const { getPool } = await import("../database/connection");
    const pool = getPool();
    const batchId = randomUUID();
    const receiptId = randomUUID();
    // Unique period per insert to avoid UX_payroll_receipts_active_period collisions.
    const year = 2090 + Math.floor(Math.random() * 9);
    const month = 1 + Math.floor(Math.random() * 12);
    batchIds.push(batchId);
    receiptIds.push(receiptId);

    await pool
      .request()
      .input("batchId", sql.UniqueIdentifier, batchId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("year", sql.Int, year)
      .input("month", sql.Int, month)
      .query(`
        INSERT INTO payroll_receipt_batches (
          id, company_id, year, month, status, total_files
        )
        VALUES (
          @batchId, @companyId, @year, @month, N'COMPLETED', 1
        )
      `);

    await pool
      .request()
      .input("receiptId", sql.UniqueIdentifier, receiptId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("year", sql.Int, year)
      .input("month", sql.Int, month)
      .query(`
        INSERT INTO payroll_receipts (
          id, company_id, batch_id, employee_id, year, month,
          original_filename, storage_provider, storage_object_key, status
        )
        VALUES (
          @receiptId, @companyId, @batchId, @employeeId, @year, @month,
          N'concurrency-test.pdf', N'GOOGLE_CLOUD_STORAGE', N'test/concurrency.pdf', N'ASSOCIATED'
        )
      `);

    return receiptId;
  };

  it("concurrent enqueue creates exactly one notification (unique constraint)", async () => {
    const receiptId = await insertAssociatedReceipt();

    const [first, second] = await Promise.all([
      payrollReceiptNotificationRepository.enqueueAvailable(companyId!, receiptId, employeeId!),
      payrollReceiptNotificationRepository.enqueueAvailable(companyId!, receiptId, employeeId!),
    ]);

    assert.equal(first.id, second.id);

    const { getPool } = await import("../database/connection");
    const pool = getPool();
    const count = await pool
      .request()
      .input("receiptId", sql.UniqueIdentifier, receiptId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT COUNT(*) AS c
        FROM whatsapp_payroll_receipt_notifications
        WHERE payroll_receipt_id = @receiptId AND company_id = @companyId
      `);
    assert.equal(Number(count.recordset[0].c), 1);
  });

  it("two concurrent claims never return the same notification id", async () => {
    const receiptA = await insertAssociatedReceipt();
    const receiptB = await insertAssociatedReceipt();
    await payrollReceiptNotificationRepository.enqueueAvailable(companyId!, receiptA, employeeId!);
    await payrollReceiptNotificationRepository.enqueueAvailable(companyId!, receiptB, employeeId!);

    const [first, second] = await Promise.all([
      payrollReceiptNotificationRepository.claimNextBatch(`w1-${randomUUID()}`, 1, 60),
      payrollReceiptNotificationRepository.claimNextBatch(`w2-${randomUUID()}`, 1, 60),
    ]);

    assert.ok(first.length + second.length >= 1);
    if (first[0] && second[0]) {
      assert.notEqual(first[0].id, second[0].id);
    }

    for (const row of [...first, ...second]) {
      await payrollReceiptNotificationRepository.markCancelled({
        companyId: companyId!,
        notificationId: row.id,
        errorCode: "TEST_CLEANUP",
        errorMessage: "concurrency test cleanup",
      });
    }
  });

  it("expired lease allows recovery claim by another worker", async () => {
    const { getPool } = await import("../database/connection");
    const pool = getPool();

    // Cancel leftover PENDING/FAILED from earlier cases so claim order is deterministic.
    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        UPDATE whatsapp_payroll_receipt_notifications
        SET status = N'CANCELLED',
            lease_owner = NULL,
            lease_expires_at = NULL,
            next_attempt_at = NULL,
            last_error_code = N'TEST_CLEANUP',
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND status IN (N'PENDING', N'FAILED', N'PROCESSING')
      `);

    const receiptId = await insertAssociatedReceipt();
    const notification = await payrollReceiptNotificationRepository.enqueueAvailable(
      companyId!,
      receiptId,
      employeeId!,
    );

    await pool
      .request()
      .input("id", sql.UniqueIdentifier, notification.id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        UPDATE whatsapp_payroll_receipt_notifications
        SET status = N'PROCESSING',
            lease_owner = N'stalled-worker',
            lease_expires_at = DATEADD(SECOND, -30, SYSUTCDATETIME()),
            attempt_count = 1,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId
      `);

    const recovered = await payrollReceiptNotificationRepository.recoverExpiredLeases(50, 5);
    assert.ok(recovered >= 1);

    const claimed = await payrollReceiptNotificationRepository.claimNextBatch(
      `recover-${randomUUID()}`,
      5,
      60,
    );
    assert.ok(claimed.some((row) => row.id === notification.id));

    for (const row of claimed) {
      await payrollReceiptNotificationRepository.markCancelled({
        companyId: companyId!,
        notificationId: row.id,
        errorCode: "TEST_CLEANUP",
        errorMessage: "concurrency test cleanup",
      });
    }
  });
});
