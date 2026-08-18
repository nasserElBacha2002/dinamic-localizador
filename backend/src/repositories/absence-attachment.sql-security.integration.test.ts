import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import { getPool } from "../database/connection";
import { absenceAttachmentRepository } from "../repositories/absence-attachment.repository";
import { ATTACHMENT_CHECKSUM_PENDING } from "../repositories/absence-attachment.repository";
import type { AbsenceAttachmentStatus } from "../types/absence-attachment";
import { AppError } from "../errors/app-error";

const uniqueCompanyName = (): string =>
  `Att SQL ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describeDatabaseIntegration("absence attachment repository SQL security", () => {
  const createdCompanyIds: string[] = [];

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  after(async () => {
    const pool = getPool();
    for (const companyId of createdCompanyIds) {
      await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
        DELETE FROM absence_request_attachments WHERE company_id = @companyId;
        DELETE FROM absence_request_drafts WHERE company_id = @companyId;
        DELETE FROM absence_request_events WHERE company_id = @companyId;
        DELETE FROM absence_workday_sync_jobs WHERE company_id = @companyId;
        DELETE FROM absence_requests WHERE company_id = @companyId;
        DELETE FROM employee_absence_balances WHERE company_id = @companyId;
        DELETE FROM employees WHERE company_id = @companyId;
        DELETE FROM employee_categories WHERE company_id = @companyId;
        DELETE FROM company_absence_settings WHERE company_id = @companyId;
        DELETE FROM absence_types WHERE company_id = @companyId;
        DELETE FROM user_company_memberships WHERE company_id = @companyId;
        DELETE FROM company_settings WHERE company_id = @companyId;
        DELETE FROM company_modules WHERE company_id = @companyId;
        DELETE FROM company_location_types WHERE company_id = @companyId;
        DELETE FROM company_work_schedule_days WHERE company_id = @companyId;
        DELETE FROM company_work_schedules WHERE company_id = @companyId;
        UPDATE absence_types SET calendar_id = NULL WHERE company_id = @companyId;
        DELETE FROM company_calendar_dates WHERE company_id = @companyId;
        DELETE FROM company_work_calendar_weekdays WHERE company_id = @companyId;
        DELETE FROM company_work_calendars WHERE company_id = @companyId;
        DELETE FROM user_invitations WHERE company_id = @companyId;
        DELETE FROM audit_logs WHERE company_id = @companyId;
        DELETE FROM companies WHERE id = @companyId;
      `);
    }
    await teardownDatabaseIntegration();
  });

  const seedCompany = async (): Promise<string> => {
    const created = await createPlatformCompanyFixture({
      name: uniqueCompanyName(),
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Att Owner",
        email: `att-owner-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@integration.test`,
      },
    });
    const companyId = created.data.company.id;
    createdCompanyIds.push(companyId);
    return companyId;
  };

  const ensureDraftScope = async (companyId: string): Promise<string> => {
    const pool = getPool();
    const employeeId = randomUUID();
    const draftId = randomUUID();
    const phone = `+54911${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;

    const typeResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM absence_types WHERE company_id = @companyId ORDER BY code
      `);
    const absenceTypeId = String(typeResult.recordset[0]?.id);
    assert.ok(absenceTypeId);

    await pool
      .request()
      .input("id", sql.UniqueIdentifier, employeeId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(30), phone)
      .query(`
        INSERT INTO employees (id, company_id, name, phone_number, active, employee_type)
        VALUES (@id, @companyId, N'Att SQL Emp', @phone, 1, N'fijo')
      `);

    await pool
      .request()
      .input("id", sql.UniqueIdentifier, draftId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("absenceTypeId", sql.UniqueIdentifier, absenceTypeId)
      .query(`
        INSERT INTO absence_request_drafts (
          id, company_id, employee_id, absence_type_id,
          start_date, end_date, start_period, end_period, reason,
          attachment_policy_snapshot, status, expires_at
        )
        VALUES (
          @id, @companyId, @employeeId, @absenceTypeId,
          '2031-07-01', '2031-07-02', N'FULL_DAY', N'FULL_DAY', N'sql security',
          N'OPTIONAL', N'OPEN', DATEADD(HOUR, 2, SYSUTCDATETIME())
        )
      `);

    return draftId;
  };

  const insertAttachment = async (
    companyId: string,
    status: AbsenceAttachmentStatus,
    extras?: { attemptCount?: number; leaseExpiresAt?: Date | null; updatedAtMinutesAgo?: number },
  ) => {
    const id = randomUUID();
    const draftId = await ensureDraftScope(companyId);
    const pool = getPool();
    const updatedAtMinutesAgo = extras?.updatedAtMinutesAgo ?? 120;
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("draftId", sql.UniqueIdentifier, draftId)
      .input("status", sql.NVarChar(30), status)
      .input("attemptCount", sql.Int, extras?.attemptCount ?? 0)
      .input("leaseExpiresAt", sql.DateTime2, extras?.leaseExpiresAt ?? null)
      .input("minutesAgo", sql.Int, updatedAtMinutesAgo)
      .input("checksum", sql.Char(64), ATTACHMENT_CHECKSUM_PENDING)
      .query(`
        INSERT INTO absence_request_attachments (
          id, company_id, draft_id, storage_provider, bucket_name, object_key,
          original_file_name, normalized_file_name, declared_content_type, detected_content_type,
          size_bytes, checksum_sha256, status, scan_status, source, attempt_count,
          lease_expires_at, created_at, updated_at
        )
        VALUES (
          @id, @companyId, @draftId, N'GOOGLE_CLOUD_STORAGE', N'test-bucket', CONCAT(N'phase2/', CAST(@id AS NVARCHAR(36)), N'.pdf'),
          N'x.pdf', N'x.pdf', N'application/pdf', N'application/pdf',
          10, @checksum, @status, N'UNSCANNED', N'ADMIN', @attemptCount,
          @leaseExpiresAt,
          DATEADD(MINUTE, -@minutesAgo, SYSUTCDATETIME()),
          DATEADD(MINUTE, -@minutesAgo, SYSUTCDATETIME())
        )
      `);
    return id;
  };

  it("markStatus applies valid transition and respects expected status optimistic guard", async () => {
    const companyId = await seedCompany();
    const id = await insertAttachment(companyId, "PENDING_UPLOAD");

    const uploading = await absenceAttachmentRepository.markStatus(companyId, id, "UPLOADING");
    assert.ok(uploading);
    assert.equal(uploading.status, "UPLOADING");
    assert.equal(uploading.attemptCount, 0);

    const stale = await absenceAttachmentRepository.markStatus(companyId, id, "AVAILABLE", {
      expectedCurrentStatuses: ["PENDING_UPLOAD"],
    });
    assert.equal(stale, null);

    const available = await absenceAttachmentRepository.markStatus(companyId, id, "AVAILABLE", {
      expectedCurrentStatuses: ["UPLOADING"],
    });
    assert.ok(available);
    assert.equal(available.status, "AVAILABLE");
  });

  it("markStatus increments attempt_count only when requested", async () => {
    const companyId = await seedCompany();
    const id = await insertAttachment(companyId, "FAILED", { attemptCount: 2 });

    const withoutInc = await absenceAttachmentRepository.markStatus(
      companyId,
      id,
      "PENDING_UPLOAD",
      { incrementAttempt: false },
    );
    assert.ok(withoutInc);
    assert.equal(withoutInc.attemptCount, 2);

    const withInc = await absenceAttachmentRepository.markStatus(companyId, id, "FAILED", {
      incrementAttempt: true,
    });
    assert.ok(withInc);
    assert.equal(withInc.attemptCount, 3);
  });

  it("markStatus rejects invalid transitions", async () => {
    const companyId = await seedCompany();
    const id = await insertAttachment(companyId, "AVAILABLE");
    await assert.rejects(
      () => absenceAttachmentRepository.markStatus(companyId, id, "UPLOADING"),
      (error: unknown) => error instanceof AppError && error.code === "ATTACHMENT_INVALID_TRANSITION",
    );
  });

  it("markStatus optimistic concurrency: stale expected status skips update", async () => {
    const companyId = await seedCompany();
    const id = await insertAttachment(companyId, "PENDING_UPLOAD");
    const row = await absenceAttachmentRepository.findByIdAny(companyId, id);
    assert.ok(row);

    // Concurrent path: force status change, then markStatus still binds @expectedStatus from its read.
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        UPDATE absence_request_attachments
        SET status = N'UPLOADING', updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId
      `);

    // Read sees UPLOADING; transitioning to AVAILABLE is valid from UPLOADING.
    const ok = await absenceAttachmentRepository.markStatus(companyId, id, "AVAILABLE");
    assert.ok(ok);
    assert.equal(ok.status, "AVAILABLE");

    // If another writer changes status between read and update, OUTPUT is empty → null.
    const id2 = await insertAttachment(companyId, "PENDING_UPLOAD");
    const before = await absenceAttachmentRepository.findByIdAny(companyId, id2);
    assert.ok(before);
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, id2)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        UPDATE absence_request_attachments
        SET status = N'FAILED', updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId
      `);
    // markStatus re-reads current=FAILED; PENDING_UPLOAD→UPLOADING invalid from FAILED without going through allowed path.
    // Use expectedCurrentStatuses gate instead:
    const skipped = await absenceAttachmentRepository.markStatus(companyId, id2, "UPLOADING", {
      expectedCurrentStatuses: ["PENDING_UPLOAD"],
    });
    assert.equal(skipped, null);
  });

  it("listForCleanup handles empty, valid filters, invalid status, limit, age, and active lease", async () => {
    const companyId = await seedCompany();
    assert.deepEqual(await absenceAttachmentRepository.listForCleanup([], 60, 10), []);

    const oldFailed = await insertAttachment(companyId, "FAILED", { updatedAtMinutesAgo: 180 });
    const oldPendingDelete = await insertAttachment(companyId, "PENDING_DELETE", {
      updatedAtMinutesAgo: 180,
    });
    await insertAttachment(companyId, "FAILED", { updatedAtMinutesAgo: 5 });
    const leased = await insertAttachment(companyId, "FAILED", {
      updatedAtMinutesAgo: 180,
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });

    const normalizeId = (value: string): string =>
      value.replace(/[{}]/g, "").toLowerCase();

    const single = await absenceAttachmentRepository.listForCleanup(["FAILED"], 60, 50);
    const singleIds = new Set(single.map((row) => normalizeId(row.id)));
    assert.ok(
      singleIds.has(normalizeId(oldFailed)),
      `expected ${oldFailed} in cleanup results (${[...singleIds].join(",")})`,
    );
    assert.equal(singleIds.has(normalizeId(leased)), false);
    assert.equal(singleIds.has(normalizeId(oldPendingDelete)), false);

    const multi = await absenceAttachmentRepository.listForCleanup(
      ["FAILED", "PENDING_DELETE"],
      60,
      50,
    );
    const multiIds = new Set(multi.map((row) => normalizeId(row.id)));
    assert.ok(multiIds.has(normalizeId(oldFailed)));
    assert.ok(multiIds.has(normalizeId(oldPendingDelete)));

    await assert.rejects(
      () =>
        absenceAttachmentRepository.listForCleanup(
          ["NOT_A_STATUS" as AbsenceAttachmentStatus],
          60,
          10,
        ),
      /Invalid absence attachment status/,
    );

    const limited = await absenceAttachmentRepository.listForCleanup(["FAILED"], 60, 1);
    assert.equal(limited.length, 1);
  });
});
