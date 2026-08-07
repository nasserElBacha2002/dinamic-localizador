/**
 * Payroll multiple receipts — SQL Server evidence (concurrency + isolation).
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 * Requires migration 086.
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  createIntegrationFixtureTracker,
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { payrollReceiptQueryDeliveryRepository } from "../repositories/payroll-receipt-query-delivery.repository";
import { payrollReceiptRepository } from "../repositories/payroll-receipt.repository";

const checksumFor = (label: string): string =>
  createHash("sha256").update(label).digest("hex");

describeDatabaseIntegration("payroll multiple receipts sql", () => {
  const fixtures = createIntegrationFixtureTracker();
  const receiptIds: string[] = [];
  const batchIds: string[] = [];
  const sessionIds: string[] = [];
  let companyId = "";
  let employeeId = "";
  let year = 0;
  let month = 0;

  before(async () => {
    await setupDatabaseIntegration();
    const { getPool } = await import("../database/connection");
    const pool = getPool();

    const company = await pool.request().query(`
      SELECT TOP 1 id
      FROM companies
      WHERE status = N'ACTIVE' OR status IS NULL
      ORDER BY
        CASE WHEN name = N'Dinamic Systems' THEN 0 ELSE 1 END,
        created_at ASC
    `);
    companyId = String(company.recordset[0]?.id ?? "");
    assert.ok(companyId, "ACTIVE company required");

    const phone = `+54911${Date.now().toString().slice(-8)}`;
    const inserted = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), "Payroll Multi Receipts Emp")
      .input("phone", sql.NVarChar(30), phone)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, @phone, N'fijo', 1);
        SELECT id FROM @inserted;
      `);
    employeeId = String(inserted.recordset[0].id);
    fixtures.trackEmployee(companyId, employeeId);

    // Stay within CK_wprqd_year (1900–2200) and avoid colliding with real payroll years.
    const stamp = Date.now();
    year = 2110 + (stamp % 80);
    month = 1 + (stamp % 12);
  });

  after(async () => {
    const { getPool } = await import("../database/connection");
    const pool = getPool();
    for (const sessionId of sessionIds) {
      await pool
        .request()
        .input("sessionId", sql.UniqueIdentifier, sessionId)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          DELETE FROM whatsapp_payroll_receipt_query_deliveries
          WHERE bot_session_id = @sessionId AND company_id = @companyId;
          DELETE FROM bot_sessions WHERE id = @sessionId;
        `);
    }
    for (const receiptId of receiptIds) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, receiptId)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          DELETE FROM whatsapp_payroll_receipt_notifications
          WHERE payroll_receipt_id = @id AND company_id = @companyId;
          DELETE FROM whatsapp_payroll_receipt_query_deliveries
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
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  const insertAssociated = async (checksum: string): Promise<string> => {
    const { getPool } = await import("../database/connection");
    const pool = getPool();
    const batchId = randomUUID();
    const receiptId = randomUUID();
    batchIds.push(batchId);
    receiptIds.push(receiptId);

    await pool
      .request()
      .input("batchId", sql.UniqueIdentifier, batchId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("year", sql.Int, year)
      .input("month", sql.Int, month)
      .query(`
        INSERT INTO payroll_receipt_batches (id, company_id, year, month, status, total_files)
        VALUES (@batchId, @companyId, @year, @month, N'COMPLETED', 1)
      `);

    await pool
      .request()
      .input("receiptId", sql.UniqueIdentifier, receiptId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("year", sql.Int, year)
      .input("month", sql.Int, month)
      .input("checksum", sql.Char(64), checksum)
      .query(`
        INSERT INTO payroll_receipts (
          id, company_id, batch_id, employee_id, year, month,
          original_filename, storage_provider, storage_object_key, checksum_sha256, status
        )
        VALUES (
          @receiptId, @companyId, @batchId, @employeeId, @year, @month,
          N'multi.pdf', N'GOOGLE_CLOUD_STORAGE', N'test/multi.pdf', @checksum, N'ASSOCIATED'
        )
      `);

    return receiptId;
  };

  const insertBotSession = async (): Promise<string> => {
    const { getPool } = await import("../database/connection");
    const pool = getPool();
    const sessionId = randomUUID();
    sessionIds.push(sessionId);
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, sessionId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        INSERT INTO bot_sessions (
          id, company_id, employee_id, phone_number, state, expires_at
        )
        VALUES (
          @id, @companyId, @employeeId, N'+5491100000099', N'WAITING_PAYROLL_RECEIPT_PERIOD',
          DATEADD(hour, 1, SYSUTCDATETIME())
        )
      `);
    return sessionId;
  };

  const normId = (value: string): string => value.toLowerCase();

  it("allows two ASSOCIATED receipts with different checksums for the same period", async () => {
    const a = await insertAssociated(checksumFor(`a-${randomUUID()}`));
    const b = await insertAssociated(checksumFor(`b-${randomUUID()}`));
    const rows = await payrollReceiptRepository.listActiveAssociated(
      companyId,
      employeeId,
      year,
      month,
    );
    const ids = new Set(rows.map((r) => normId(r.id)));
    assert.ok(ids.has(normId(a)), `expected ${a} among ${[...ids].join(",")}`);
    assert.ok(ids.has(normId(b)), `expected ${b} among ${[...ids].join(",")}`);
  });

  it("rejects a second ASSOCIATED with the same checksum via unique index", async () => {
    const checksum = checksumFor(`same-${randomUUID()}`);
    await insertAssociated(checksum);
    await assert.rejects(async () => insertAssociated(checksum), (error: unknown) => {
      const number = (error as { number?: number }).number;
      return number === 2627 || number === 2601;
    });
  });

  it("concurrent inserts with distinct checksums both become ASSOCIATED", async () => {
    const results = await Promise.allSettled([
      insertAssociated(checksumFor(`conc-a-${randomUUID()}`)),
      insertAssociated(checksumFor(`conc-b-${randomUUID()}`)),
    ]);
    assert.equal(results[0]?.status, "fulfilled");
    assert.equal(results[1]?.status, "fulfilled");
    if (results[0]?.status !== "fulfilled" || results[1]?.status !== "fulfilled") {
      return;
    }
    const rows = await payrollReceiptRepository.listActiveAssociated(
      companyId,
      employeeId,
      year,
      month,
    );
    const ids = new Set(rows.map((r) => normId(r.id)));
    assert.ok(ids.has(normId(results[0].value)));
    assert.ok(ids.has(normId(results[1].value)));
  });

  it("concurrent inserts with the same checksum leave exactly one ASSOCIATED", async () => {
    const checksum = checksumFor(`conc-same-${randomUUID()}`);
    const results = await Promise.allSettled([
      insertAssociated(checksum),
      insertAssociated(checksum),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    const number = (rejected[0] as PromiseRejectedResult).reason?.number;
    assert.ok(number === 2627 || number === 2601);

    const { getPool } = await import("../database/connection");
    const pool = getPool();
    const count = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("year", sql.Int, year)
      .input("month", sql.Int, month)
      .input("checksum", sql.Char(64), checksum)
      .query(`
        SELECT COUNT(*) AS c
        FROM payroll_receipts
        WHERE company_id = @companyId
          AND employee_id = @employeeId
          AND year = @year
          AND month = @month
          AND checksum_sha256 = @checksum
          AND status = N'ASSOCIATED'
          AND deleted_at IS NULL
      `);
    assert.equal(Number(count.recordset[0].c), 1);
  });

  it("ensurePendingDeliveries concurrent x2 keeps exactly one row", async () => {
    const receiptId = await insertAssociated(checksumFor(`ensure-${randomUUID()}`));
    const sessionId = await insertBotSession();

    await Promise.all([
      payrollReceiptQueryDeliveryRepository.ensurePendingDeliveries({
        companyId,
        botSessionId: sessionId,
        employeeId,
        year,
        month,
        payrollReceiptIds: [receiptId],
      }),
      payrollReceiptQueryDeliveryRepository.ensurePendingDeliveries({
        companyId,
        botSessionId: sessionId,
        employeeId,
        year,
        month,
        payrollReceiptIds: [receiptId],
      }),
    ]);

    const { getPool } = await import("../database/connection");
    const pool = getPool();
    const count = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("sessionId", sql.UniqueIdentifier, sessionId)
      .input("receiptId", sql.UniqueIdentifier, receiptId)
      .input("year", sql.Int, year)
      .input("month", sql.Int, month)
      .query(`
        SELECT COUNT(*) AS c
        FROM whatsapp_payroll_receipt_query_deliveries
        WHERE company_id = @companyId
          AND bot_session_id = @sessionId
          AND payroll_receipt_id = @receiptId
          AND year = @year
          AND month = @month
      `);
    assert.equal(Number(count.recordset[0].c), 1);
  });

  it("listForQuery isolates periods within the same bot session", async () => {
    const julyYear = year;
    const julyMonth = month;
    const augMonth = month === 12 ? 1 : month + 1;
    const augYear = month === 12 ? year + 1 : year;

    const julyReceipt = await insertAssociated(checksumFor(`july-${randomUUID()}`));
    // Insert August receipt with same employee
    const { getPool } = await import("../database/connection");
    const pool = getPool();
    const batchId = randomUUID();
    const augReceipt = randomUUID();
    batchIds.push(batchId);
    receiptIds.push(augReceipt);
    await pool
      .request()
      .input("batchId", sql.UniqueIdentifier, batchId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("year", sql.Int, augYear)
      .input("month", sql.Int, augMonth)
      .query(`
        INSERT INTO payroll_receipt_batches (id, company_id, year, month, status, total_files)
        VALUES (@batchId, @companyId, @year, @month, N'COMPLETED', 1)
      `);
    await pool
      .request()
      .input("receiptId", sql.UniqueIdentifier, augReceipt)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("year", sql.Int, augYear)
      .input("month", sql.Int, augMonth)
      .input("checksum", sql.Char(64), checksumFor(`aug-${randomUUID()}`))
      .query(`
        INSERT INTO payroll_receipts (
          id, company_id, batch_id, employee_id, year, month,
          original_filename, storage_provider, storage_object_key, checksum_sha256, status
        )
        VALUES (
          @receiptId, @companyId, @batchId, @employeeId, @year, @month,
          N'aug.pdf', N'GOOGLE_CLOUD_STORAGE', N'test/aug.pdf', @checksum, N'ASSOCIATED'
        )
      `);

    const sessionId = await insertBotSession();
    await payrollReceiptQueryDeliveryRepository.ensurePendingDeliveries({
      companyId,
      botSessionId: sessionId,
      employeeId,
      year: julyYear,
      month: julyMonth,
      payrollReceiptIds: [julyReceipt],
    });
    await payrollReceiptQueryDeliveryRepository.ensurePendingDeliveries({
      companyId,
      botSessionId: sessionId,
      employeeId,
      year: augYear,
      month: augMonth,
      payrollReceiptIds: [augReceipt],
    });

    const julyRows = await payrollReceiptQueryDeliveryRepository.listForQuery({
      companyId,
      botSessionId: sessionId,
      employeeId,
      year: julyYear,
      month: julyMonth,
    });
    const augRows = await payrollReceiptQueryDeliveryRepository.listForQuery({
      companyId,
      botSessionId: sessionId,
      employeeId,
      year: augYear,
      month: augMonth,
    });

    assert.equal(julyRows.length, 1);
    assert.equal(normId(julyRows[0]?.payrollReceiptId ?? ""), normId(julyReceipt));
    assert.equal(augRows.length, 1);
    assert.equal(normId(augRows[0]?.payrollReceiptId ?? ""), normId(augReceipt));
  });
});
