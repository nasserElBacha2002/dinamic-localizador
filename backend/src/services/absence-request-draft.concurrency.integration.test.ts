/**
 * Phase 5 corrections — concurrent draft submit CAS / orphan safety (real SQL).
 * Enable: RUN_DB_INTEGRATION_TESTS=true
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
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import { getPool } from "../database/connection";
import { deleteCompanyCascade } from "../test-helpers/integration-cleanup";
import { userRepository } from "../repositories/user.repository";
import { absenceRequestDraftRepository } from "../repositories/absence-request-draft.repository";
import { absenceRequestDraftService } from "./absence-request-draft.service";
import { AppError } from "../errors/app-error";

const uniqueName = (): string =>
  `Draft CAS ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describeDatabaseIntegration("absence draft submit concurrency CAS", () => {
  const companyIds: string[] = [];
  let companyId = "";
  let userId = "";
  let employeeId = "";
  let absenceTypeId = "";

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
    const admin = await userRepository.findByEmail("admin@dinamicsystems.com");
    assert.ok(admin?.id, "platform admin required");
    userId = admin.id;

    const created = await createPlatformCompanyFixture({
      name: uniqueName(),
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Draft Owner",
        email: `draft-owner-${Date.now()}@integration.test`,
      },
    });
    companyId = created.data.company.id;
    companyIds.push(companyId);

    const pool = getPool();
    const type = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id
        FROM absence_types
        WHERE company_id = @companyId
          AND attachment_policy IN (N'OPTIONAL', N'FORBIDDEN')
          AND is_active = 1
        ORDER BY code
      `);
    absenceTypeId = String(type.recordset[0]?.id ?? "");
    assert.ok(absenceTypeId, "active absence type required");

    // Prefer OPTIONAL so draft create is allowed.
    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, absenceTypeId)
      .query(`
        UPDATE absence_types
        SET attachment_policy = N'OPTIONAL',
            requires_attachment = 0,
            requires_approval = 1
        WHERE company_id = @companyId AND id = @id
      `);

    employeeId = randomUUID();
    const phone = `+54911${Date.now().toString().slice(-8)}`;
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, employeeId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(30), phone)
      .query(`
        INSERT INTO employees (id, company_id, name, phone_number, active, employee_type)
        VALUES (@id, @companyId, N'Draft CAS Emp', @phone, 1, N'fijo')
      `);
  });

  after(async () => {
    for (const id of companyIds) {
      await deleteCompanyCascade(id);
    }
    await teardownDatabaseIntegration();
  });

  let draftSeq = 0;

  const createOpenDraft = async () => {
    draftSeq += 1;
    const day = String((draftSeq % 28) + 1).padStart(2, "0");
    const month = String(((Math.floor(draftSeq / 28) % 12) + 1)).padStart(2, "0");
    const date = `2033-${month}-${day}`;
    return absenceRequestDraftService.create(
      companyId,
      {
        employeeId,
        absenceTypeId,
        startDate: date,
        endDate: date,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: `draft cas concurrent ${draftSeq}`,
      },
      userId,
    );
  };

  const countRequestsForEmployee = async (): Promise<number> => {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT COUNT(1) AS c
        FROM absence_requests
        WHERE company_id = @companyId AND employee_id = @employeeId
      `);
    return Number(result.recordset[0]?.c ?? 0);
  };

  const countLinkedAttachments = async (draftId: string, requestId: string): Promise<number> => {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("draftId", sql.UniqueIdentifier, draftId)
      .input("requestId", sql.UniqueIdentifier, requestId)
      .query(`
        SELECT COUNT(1) AS c
        FROM absence_request_attachments
        WHERE company_id = @companyId
          AND draft_id = @draftId
          AND absence_request_id = @requestId
      `);
    return Number(result.recordset[0]?.c ?? 0);
  };

  it("same draft + same idempotency key concurrent → one logical request", async () => {
    const draft = await createOpenDraft();
    const key = `idem-${randomUUID()}`;
    const before = await countRequestsForEmployee();

    const [a, b] = await Promise.all([
      absenceRequestDraftService.submit(companyId, draft.id, userId, key),
      absenceRequestDraftService.submit(companyId, draft.id, userId, key),
    ]);

    assert.equal(a.id, b.id);
    const after = await countRequestsForEmployee();
    assert.equal(after, before + 1);

    const durable = await absenceRequestDraftRepository.findById(companyId, draft.id);
    assert.equal(durable?.status, "SUBMITTED");
    assert.equal(durable?.submittedRequestId, a.id);
    assert.equal(durable?.submitIdempotencyKey, key);
  });

  it("same draft + different idempotency keys → one winner + conflict", async () => {
    const draft = await createOpenDraft();
    const keyA = `idem-a-${randomUUID()}`;
    const keyB = `idem-b-${randomUUID()}`;
    const before = await countRequestsForEmployee();

    const results = await Promise.allSettled([
      absenceRequestDraftService.submit(companyId, draft.id, userId, keyA),
      absenceRequestDraftService.submit(companyId, draft.id, userId, keyB),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(
      fulfilled.length,
      1,
      `expected one winner; rejected=${rejected.map((r) => (r as PromiseRejectedResult).reason).join(" | ")}`,
    );
    assert.equal(rejected.length, 1);
    const err = (rejected[0] as PromiseRejectedResult).reason;
    assert.ok(err instanceof AppError);
    assert.equal(err.code, "ABSENCE_DRAFT_IDEMPOTENCY_CONFLICT");

    const after = await countRequestsForEmployee();
    // Winner creates one durable request; loser must not leave a PENDING orphan.
    assert.equal(after, before + 1);
  });

  it("submit || cancel → no orphan request", async () => {
    const draft = await createOpenDraft();
    const key = `idem-cancel-${randomUUID()}`;
    const before = await countRequestsForEmployee();

    const results = await Promise.allSettled([
      absenceRequestDraftService.submit(companyId, draft.id, userId, key),
      absenceRequestDraftRepository.markCancelledIfOpen(companyId, draft.id),
    ]);

    const durable = await absenceRequestDraftRepository.findById(companyId, draft.id);
    assert.ok(durable);
    assert.ok(durable.status === "SUBMITTED" || durable.status === "CANCELLED");

    if (durable.status === "SUBMITTED") {
      assert.ok(durable.submittedRequestId);
      const submitOk = results.some(
        (r) => r.status === "fulfilled" && typeof r.value === "object",
      );
      assert.ok(submitOk);
    } else {
      const submitRejected = results.some(
        (r) =>
          r.status === "rejected" &&
          r.reason instanceof AppError &&
          (r.reason.code === "ABSENCE_DRAFT_NOT_OPEN" ||
            r.reason.code === "ABSENCE_DRAFT_EXPIRED"),
      );
      assert.ok(submitRejected || durable.status === "CANCELLED");
    }

    const after = await countRequestsForEmployee();
    const expectedMax = durable.status === "SUBMITTED" ? before + 1 : before;
    assert.ok(after <= expectedMax);
    assert.equal(after, expectedMax);
  });

  it("submit || expire → no orphan request", async () => {
    const draft = await createOpenDraft();
    const key = `idem-expire-${randomUUID()}`;
    const before = await countRequestsForEmployee();

    await Promise.allSettled([
      absenceRequestDraftService.submit(companyId, draft.id, userId, key),
      absenceRequestDraftRepository.markExpiredIfOpen(companyId, draft.id),
    ]);

    const durable = await absenceRequestDraftRepository.findById(companyId, draft.id);
    assert.ok(durable);
    assert.ok(durable.status === "SUBMITTED" || durable.status === "EXPIRED");

    const after = await countRequestsForEmployee();
    const expected = durable.status === "SUBMITTED" ? before + 1 : before;
    assert.equal(after, expected);
  });

  it("CAS lose → attachments stay off non-durable request", async () => {
    const draft = await createOpenDraft();
    const pool = getPool();
    const attachmentId = randomUUID();
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, attachmentId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("draftId", sql.UniqueIdentifier, draft.id)
      .query(`
        INSERT INTO absence_request_attachments (
          id, company_id, draft_id, storage_provider, bucket_name, object_key,
          original_file_name, normalized_file_name, declared_content_type, detected_content_type,
          size_bytes, checksum_sha256, status, scan_status, source, attempt_count
        )
        VALUES (
          @id, @companyId, @draftId, N'GOOGLE_CLOUD_STORAGE', N'test-bucket',
          CONCAT(N'draft-cas/', CAST(@id AS NVARCHAR(36)), N'.pdf'),
          N'x.pdf', N'x.pdf', N'application/pdf', N'application/pdf',
          10, REPLICATE('a', 64), N'AVAILABLE', N'UNSCANNED', N'ADMIN', 0
        )
      `);

    const keyA = `attach-a-${randomUUID()}`;
    const keyB = `attach-b-${randomUUID()}`;
    const results = await Promise.allSettled([
      absenceRequestDraftService.submit(companyId, draft.id, userId, keyA),
      absenceRequestDraftService.submit(companyId, draft.id, userId, keyB),
    ]);

    const winner = results.find((r) => r.status === "fulfilled") as
      | PromiseFulfilledResult<{ id: string }>
      | undefined;
    assert.ok(winner);
    const durable = await absenceRequestDraftRepository.findById(companyId, draft.id);
    assert.equal(durable?.submittedRequestId, winner.value.id);
    assert.equal(await countLinkedAttachments(draft.id, winner.value.id), 1);

    const wrongLinks = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("draftId", sql.UniqueIdentifier, draft.id)
      .input("requestId", sql.UniqueIdentifier, winner.value.id)
      .query(`
        SELECT COUNT(1) AS c
        FROM absence_request_attachments
        WHERE company_id = @companyId
          AND draft_id = @draftId
          AND absence_request_id IS NOT NULL
          AND absence_request_id <> @requestId
      `);
    assert.equal(Number(wrongLinks.recordset[0]?.c ?? 0), 0);
  });
});
