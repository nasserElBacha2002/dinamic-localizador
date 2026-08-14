import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, it } from "node:test";
import { AppError } from "../errors/app-error";
import { setAttachmentStorageForTests } from "./attachment-storage";
import { InMemoryAttachmentStorage } from "./attachment-storage/in-memory-attachment-storage";
import { employeeRepository } from "../repositories/employee.repository";
import { payrollReceiptRepository } from "../repositories/payroll-receipt.repository";
import { pendingStorageDeletionRepository } from "../repositories/pending-storage-deletion.repository";
import type { PayrollReceipt, PayrollReceiptBatch } from "../types/payroll-receipt";
import type { Employee } from "../types/domain";
import { payrollReceiptService } from "./payroll-receipt.service";
import { auditService } from "./audit.service";

const COMPANY_ID = "11111111-1111-1111-1111-111111111111";
const BATCH_ID = "22222222-2222-2222-2222-222222222222";
const EMPLOYEE_ID = "33333333-3333-3333-3333-333333333333";
const USER_ID = "44444444-4444-4444-4444-444444444444";
const OLD_RECEIPT_ID = "55555555-5555-5555-5555-555555555555";
const VALID_CUIL = "20123456786";

const pdfBuffer = Buffer.from("%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

const baseBatch = (): PayrollReceiptBatch => ({
  id: BATCH_ID,
  companyId: COMPANY_ID,
  year: 2024,
  month: 3,
  status: "PROCESSING",
  totalFiles: 0,
  processedFiles: 0,
  associatedFiles: 0,
  failedFiles: 0,
  createdByUserId: USER_ID,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const baseEmployee = (): Employee =>
  ({
    id: EMPLOYEE_ID,
    companyId: COMPANY_ID,
    name: "Juan Perez",
    documentNumber: "20-12345678-6",
    phoneNumber: "+5491100000000",
    employeeType: "INTERNAL",
    categoryId: null,
    category: null,
    locationZoneId: null,
    locationZone: null,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }) as Employee;

const store = new Map<string, PayrollReceipt>();
let batchState = baseBatch();
let reserveSucceeds = true;
let finalizeReplaceCalls = 0;
let markReplacedCalls = 0;

const stub = <T extends object, K extends keyof T>(obj: T, key: K, impl: T[K]) => {
  const previous = obj[key];
  obj[key] = impl;
  return () => {
    obj[key] = previous;
  };
};

describe("payrollReceiptService", () => {
  const restores: Array<() => void> = [];

  beforeEach(() => {
    process.env.GCS_BUCKET_NAME = "test-bucket";
    process.env.PAYROLL_RECEIPTS_STORAGE_PREFIX = "payroll-receipts";
    setAttachmentStorageForTests(new InMemoryAttachmentStorage("test-bucket"));
    store.clear();
    batchState = baseBatch();
    reserveSucceeds = true;
    finalizeReplaceCalls = 0;
    markReplacedCalls = 0;

    restores.push(
      stub(auditService, "log", async () => undefined),
      stub(pendingStorageDeletionRepository, "enqueueKeys", async () => undefined),
      stub(payrollReceiptRepository, "createBatch", async (input) => {
        batchState = {
          ...baseBatch(),
          id: input.id,
          companyId: input.companyId,
          year: input.year,
          month: input.month,
          status: input.status ?? "PROCESSING",
          createdByUserId: input.createdByUserId ?? null,
        };
        return batchState;
      }),
      stub(payrollReceiptRepository, "findBatchById", async (companyId, batchId) =>
        companyId === COMPANY_ID && batchId === batchState.id ? batchState : null,
      ),
      stub(payrollReceiptRepository, "findByIdempotencyKey", async () => null),
      stub(payrollReceiptRepository, "findActiveAssociatedByChecksum", async () => null),
      stub(payrollReceiptRepository, "listActiveAssociated", async () => []),
      stub(payrollReceiptRepository, "tryReserveBatchSlot", async () => {
        if (!reserveSucceeds) {
          return false;
        }
        batchState.totalFiles += 1;
        return true;
      }),
      stub(payrollReceiptRepository, "releaseBatchSlot", async () => {
        batchState.totalFiles = Math.max(0, batchState.totalFiles - 1);
      }),
      stub(payrollReceiptRepository, "createPending", async (input) => {
        const row: PayrollReceipt = {
          id: input.id,
          companyId: input.companyId,
          batchId: input.batchId,
          employeeId: input.employeeId ?? null,
          year: input.year,
          month: input.month,
          originalFilename: input.originalFilename,
          storageProvider: "GOOGLE_CLOUD_STORAGE",
          storageBucket: null,
          storageObjectKey: null,
          objectGeneration: null,
          detectedDocument: input.detectedDocument ?? null,
          normalizedDocument: input.normalizedDocument ?? null,
          status: input.status,
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage ?? null,
          mimeType: null,
          fileSize: null,
          checksumSha256: null,
          idempotencyKey: input.idempotencyKey ?? null,
          uploadedByUserId: input.uploadedByUserId ?? null,
          replacedReceiptId: input.replacedReceiptId ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          deletedByUserId: null,
        };
        store.set(row.id, row);
        return row;
      }),
      stub(payrollReceiptRepository, "markStatus", async (companyId, receiptId, status) => {
        const row = store.get(receiptId);
        if (!row || row.companyId !== companyId) return null;
        row.status = status;
        store.set(receiptId, row);
        return row;
      }),
      stub(payrollReceiptRepository, "finalizeUpload", async (input) => {
        const row = store.get(input.receiptId);
        if (!row || row.companyId !== input.companyId) return null;
        Object.assign(row, {
          status: input.status,
          employeeId: input.employeeId ?? row.employeeId,
          storageBucket: input.storageBucket ?? row.storageBucket,
          storageObjectKey: input.storageObjectKey ?? row.storageObjectKey,
          objectGeneration: input.objectGeneration ?? row.objectGeneration,
          mimeType: input.mimeType ?? row.mimeType,
          fileSize: input.fileSize ?? row.fileSize,
          checksumSha256: input.checksumSha256 ?? row.checksumSha256,
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage ?? null,
          detectedDocument: input.detectedDocument ?? row.detectedDocument,
          normalizedDocument: input.normalizedDocument ?? row.normalizedDocument,
        });
        store.set(row.id, row);
        return row;
      }),
      stub(payrollReceiptRepository, "finalizeReplaceInTransaction", async (input) => {
        finalizeReplaceCalls += 1;
        const row = store.get(input.newReceiptId);
        if (!row || row.companyId !== input.companyId) {
          throw new AppError(404, "PAYROLL_RECEIPT_NOT_FOUND", "missing");
        }
        Object.assign(row, {
          status: "ASSOCIATED",
          employeeId: input.employeeId,
          storageBucket: input.storageBucket,
          storageObjectKey: input.storageObjectKey,
          objectGeneration: input.objectGeneration,
          mimeType: input.mimeType,
          fileSize: input.fileSize,
          checksumSha256: input.checksumSha256,
          errorCode: null,
          errorMessage: null,
          detectedDocument: input.detectedDocument,
          normalizedDocument: input.normalizedDocument,
        });
        store.set(row.id, row);
        const old = store.get(input.oldReceiptId);
        if (old) {
          old.status = "REPLACED";
          old.deletedAt = new Date().toISOString();
          store.set(old.id, old);
        }
        return row;
      }),
      stub(payrollReceiptRepository, "refreshBatchStatus", async () => batchState),
      stub(payrollReceiptRepository, "findById", async (_c, id) => store.get(id) ?? null),
      stub(employeeRepository, "findByNormalizedDocument", async () => [baseEmployee()]),
    );
  });

  afterEach(() => {
    while (restores.length) {
      restores.pop()?.();
    }
    setAttachmentStorageForTests(null);
  });

  it("creates a batch", async () => {
    const data = await payrollReceiptService.createBatch(
      COMPANY_ID,
      { year: 2024, month: 3 },
      USER_ID,
    );
    assert.equal(data.year, 2024);
    assert.equal(data.month, 3);
    assert.equal(data.status, "PROCESSING");
  });

  it("associates a PDF receipt on happy path", async () => {
    const data = await payrollReceiptService.uploadReceipt({
      companyId: COMPANY_ID,
      batchId: BATCH_ID,
      body: Readable.from(pdfBuffer),
      originalFileName: `recibo_${VALID_CUIL}.pdf`,
      declaredContentType: "application/pdf",
      uploadedByUserId: USER_ID,
      idempotencyKey: "idempotency-key-1",
    });
    assert.equal(data.status, "ASSOCIATED");
    assert.equal(data.employeeId, EMPLOYEE_ID);
    assert.equal(data.hasFile, true);
    assert.equal(data.normalizedDocument, VALID_CUIL);
  });

  it("associates a second distinct PDF for the same employee and period", async () => {
    const first = await payrollReceiptService.uploadReceipt({
      companyId: COMPANY_ID,
      batchId: BATCH_ID,
      body: Readable.from(pdfBuffer),
      originalFileName: `recibo_${VALID_CUIL}.pdf`,
      declaredContentType: "application/pdf",
      uploadedByUserId: USER_ID,
      idempotencyKey: "idempotency-key-first",
    });
    assert.equal(first.status, "ASSOCIATED");

    const otherPdf = Buffer.from(
      "%PDF-1.4\n%âãÏÓ\n2 0 obj\n<< /Title (other) >>\nendobj\ntrailer\n<<>>\n%%EOF\n",
    );
    const second = await payrollReceiptService.uploadReceipt({
      companyId: COMPANY_ID,
      batchId: BATCH_ID,
      body: Readable.from(otherPdf),
      originalFileName: `ajuste_${VALID_CUIL}.pdf`,
      declaredContentType: "application/pdf",
      uploadedByUserId: USER_ID,
      idempotencyKey: "idempotency-key-second",
    });
    assert.equal(second.status, "ASSOCIATED");
    assert.notEqual(first.id, second.id);
  });

  it("marks DUPLICATE without keeping a second ASSOCIATED when checksum matches", async () => {
    restores.push(
      stub(payrollReceiptRepository, "findActiveAssociatedByChecksum", async () => ({
        id: OLD_RECEIPT_ID,
        companyId: COMPANY_ID,
        batchId: BATCH_ID,
        employeeId: EMPLOYEE_ID,
        year: 2024,
        month: 3,
        status: "ASSOCIATED",
        originalFilename: "prev.pdf",
        storageProvider: "GOOGLE_CLOUD_STORAGE",
        storageBucket: "b",
        storageObjectKey: "k",
        objectGeneration: "1",
        detectedDocument: VALID_CUIL,
        normalizedDocument: VALID_CUIL,
        errorCode: null,
        errorMessage: null,
        mimeType: "application/pdf",
        fileSize: 10,
        checksumSha256: "a".repeat(64),
        idempotencyKey: null,
        uploadedByUserId: USER_ID,
        replacedReceiptId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        deletedByUserId: null,
        employeeName: "Juan",
      })),
    );

    const data = await payrollReceiptService.uploadReceipt({
      companyId: COMPANY_ID,
      batchId: BATCH_ID,
      body: Readable.from(pdfBuffer),
      originalFileName: `recibo_${VALID_CUIL}.pdf`,
      declaredContentType: "application/pdf",
      uploadedByUserId: USER_ID,
      idempotencyKey: "idempotency-key-dup",
    });
    assert.equal(data.status, "DUPLICATE");
    assert.equal(data.hasFile, false);
  });

  it("returns EMPLOYEE_NOT_FOUND when no employee matches", async () => {
    restores.push(
      stub(employeeRepository, "findByNormalizedDocument", async () => []),
    );

    const data = await payrollReceiptService.uploadReceipt({
      companyId: COMPANY_ID,
      batchId: BATCH_ID,
      body: Readable.from(pdfBuffer),
      originalFileName: `recibo_${VALID_CUIL}.pdf`,
      declaredContentType: "application/pdf",
      uploadedByUserId: USER_ID,
      idempotencyKey: "idempotency-key-nf",
    });
    assert.equal(data.status, "EMPLOYEE_NOT_FOUND");
  });

  it("returns DOCUMENT_NOT_FOUND when filename has no CUIL", async () => {
    const data = await payrollReceiptService.uploadReceipt({
      companyId: COMPANY_ID,
      batchId: BATCH_ID,
      body: Readable.from(pdfBuffer),
      originalFileName: "recibo_sin_documento.pdf",
      declaredContentType: "application/pdf",
      uploadedByUserId: USER_ID,
      idempotencyKey: "idempotency-key-doc",
    });
    assert.equal(data.status, "DOCUMENT_NOT_FOUND");
  });

  it("rejects upload when batch slot reservation fails", async () => {
    reserveSucceeds = false;
    await assert.rejects(
      () =>
        payrollReceiptService.uploadReceipt({
          companyId: COMPANY_ID,
          batchId: BATCH_ID,
          body: Readable.from(pdfBuffer),
          originalFileName: `recibo_${VALID_CUIL}.pdf`,
          declaredContentType: "application/pdf",
          uploadedByUserId: USER_ID,
          idempotencyKey: "idempotency-key-limit",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "PAYROLL_BATCH_FILE_LIMIT",
    );
    assert.equal(store.size, 0);
  });

  it("replace uses finalizeReplaceInTransaction after GCS upload (not markReplaced first)", async () => {
    store.set(OLD_RECEIPT_ID, {
      id: OLD_RECEIPT_ID,
      companyId: COMPANY_ID,
      batchId: BATCH_ID,
      employeeId: EMPLOYEE_ID,
      year: 2024,
      month: 3,
      originalFilename: `old_${VALID_CUIL}.pdf`,
      storageProvider: "GOOGLE_CLOUD_STORAGE",
      storageBucket: "test-bucket",
      storageObjectKey: "old-key",
      objectGeneration: "1",
      detectedDocument: VALID_CUIL,
      normalizedDocument: VALID_CUIL,
      status: "ASSOCIATED",
      errorCode: null,
      errorMessage: null,
      mimeType: "application/pdf",
      fileSize: 10,
      checksumSha256: "b".repeat(64),
      idempotencyKey: null,
      uploadedByUserId: USER_ID,
      replacedReceiptId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      deletedByUserId: null,
    });

    // Guard: markReplaced must not exist / not be called on the happy replace path
    if ("markReplaced" in payrollReceiptRepository) {
      restores.push(
        stub(
          payrollReceiptRepository as typeof payrollReceiptRepository & {
            markReplaced: () => Promise<null>;
          },
          "markReplaced",
          async () => {
            markReplacedCalls += 1;
            return null;
          },
        ),
      );
    }

    const data = await payrollReceiptService.replaceReceipt({
      companyId: COMPANY_ID,
      receiptId: OLD_RECEIPT_ID,
      body: Readable.from(pdfBuffer),
      originalFileName: `recibo_${VALID_CUIL}.pdf`,
      declaredContentType: "application/pdf",
      uploadedByUserId: USER_ID,
      idempotencyKey: "idempotency-key-replace",
    });

    assert.equal(data.status, "ASSOCIATED");
    assert.equal(finalizeReplaceCalls, 1);
    assert.equal(markReplacedCalls, 0);
    assert.equal(store.get(OLD_RECEIPT_ID)?.status, "REPLACED");
  });

  it("replace among siblings only soft-replaces the target receipt", async () => {
    const siblingA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const siblingC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    for (const [id, name] of [
      [siblingA, "a"],
      [OLD_RECEIPT_ID, "b"],
      [siblingC, "c"],
    ] as const) {
      store.set(id, {
        id,
        companyId: COMPANY_ID,
        batchId: BATCH_ID,
        employeeId: EMPLOYEE_ID,
        year: 2024,
        month: 3,
        originalFilename: `${name}_${VALID_CUIL}.pdf`,
        storageProvider: "GOOGLE_CLOUD_STORAGE",
        storageBucket: "test-bucket",
        storageObjectKey: `${name}-key`,
        objectGeneration: "1",
        detectedDocument: VALID_CUIL,
        normalizedDocument: VALID_CUIL,
        status: "ASSOCIATED",
        errorCode: null,
        errorMessage: null,
        mimeType: "application/pdf",
        fileSize: 10,
        checksumSha256: name.repeat(64).slice(0, 64),
        idempotencyKey: null,
        uploadedByUserId: USER_ID,
        replacedReceiptId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        deletedByUserId: null,
      });
    }

    const data = await payrollReceiptService.replaceReceipt({
      companyId: COMPANY_ID,
      receiptId: OLD_RECEIPT_ID,
      body: Readable.from(pdfBuffer),
      originalFileName: `recibo_${VALID_CUIL}.pdf`,
      declaredContentType: "application/pdf",
      uploadedByUserId: USER_ID,
      idempotencyKey: "idempotency-key-replace-siblings",
    });

    assert.equal(data.status, "ASSOCIATED");
    assert.equal(store.get(OLD_RECEIPT_ID)?.status, "REPLACED");
    assert.equal(store.get(siblingA)?.status, "ASSOCIATED");
    assert.equal(store.get(siblingC)?.status, "ASSOCIATED");
  });

  it("softDelete only removes the targeted receipt id", async () => {
    const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
    const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
    const c = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
    for (const id of [a, b, c]) {
      store.set(id, {
        id,
        companyId: COMPANY_ID,
        batchId: BATCH_ID,
        employeeId: EMPLOYEE_ID,
        year: 2024,
        month: 3,
        originalFilename: `${id}.pdf`,
        storageProvider: "GOOGLE_CLOUD_STORAGE",
        storageBucket: "test-bucket",
        storageObjectKey: `${id}-key`,
        objectGeneration: "1",
        detectedDocument: VALID_CUIL,
        normalizedDocument: VALID_CUIL,
        status: "ASSOCIATED",
        errorCode: null,
        errorMessage: null,
        mimeType: "application/pdf",
        fileSize: 10,
        checksumSha256: id.replace(/-/g, "").padEnd(64, "0").slice(0, 64),
        idempotencyKey: null,
        uploadedByUserId: USER_ID,
        replacedReceiptId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        deletedByUserId: null,
      });
    }

    restores.push(
      stub(payrollReceiptRepository, "softDelete", async (input) => {
        const row = store.get(input.receiptId);
        if (!row) {
          return null;
        }
        const updated = {
          ...row,
          status: "DELETED" as const,
          deletedAt: new Date().toISOString(),
          deletedByUserId: input.deletedByUserId,
        };
        store.set(input.receiptId, updated);
        return updated;
      }),
    );

    await payrollReceiptService.softDelete({
      companyId: COMPANY_ID,
      receiptId: b,
      deletedByUserId: USER_ID,
    });

    assert.equal(store.get(a)?.status, "ASSOCIATED");
    assert.equal(store.get(b)?.status, "DELETED");
    assert.equal(store.get(c)?.status, "ASSOCIATED");
  });

  it("reconcileAssociation asks for re-upload when CUIL/employee would succeed without file", async () => {
    const failedId = "66666666-6666-6666-6666-666666666666";
    store.set(failedId, {
      id: failedId,
      companyId: COMPANY_ID,
      batchId: BATCH_ID,
      employeeId: null,
      year: 2024,
      month: 3,
      originalFilename: `recibo_${VALID_CUIL}.pdf`,
      storageProvider: "GOOGLE_CLOUD_STORAGE",
      storageBucket: null,
      storageObjectKey: null,
      objectGeneration: null,
      detectedDocument: null,
      normalizedDocument: null,
      status: "EMPLOYEE_NOT_FOUND",
      errorCode: "EMPLOYEE_NOT_FOUND",
      errorMessage: "missing",
      mimeType: null,
      fileSize: null,
      checksumSha256: null,
      idempotencyKey: null,
      uploadedByUserId: USER_ID,
      replacedReceiptId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      deletedByUserId: null,
    });

    await assert.rejects(
      () =>
        payrollReceiptService.reconcileAssociation({
          companyId: COMPANY_ID,
          receiptId: failedId,
          uploadedByUserId: USER_ID,
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "PAYROLL_RECEIPT_RECONCILE_NEEDS_REUPLOAD",
    );
  });
});
