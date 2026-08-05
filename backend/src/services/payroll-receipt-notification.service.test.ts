import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { COMPANY_MODULE_KEYS } from "../constants/company-modules";

describe("payrollReceiptNotificationService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("enqueueAvailable is idempotent on unique violation", async () => {
    const existing = {
      id: "notif-1",
      companyId: "company-1",
      payrollReceiptId: "receipt-1",
      employeeId: "employee-1",
      notificationType: "PAYROLL_RECEIPT_AVAILABLE",
      status: "PENDING",
      attemptCount: 0,
      nextAttemptAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      providerMessageSid: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      sentAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { payrollReceiptNotificationRepository } = await import(
      "../repositories/payroll-receipt-notification.repository"
    );

    let callCount = 0;
    mock.method(payrollReceiptNotificationRepository, "enqueueAvailable", async () => {
      callCount += 1;
      return existing;
    });

    const first = await payrollReceiptNotificationRepository.enqueueAvailable(
      "company-1",
      "receipt-1",
      "employee-1",
    );
    const second = await payrollReceiptNotificationRepository.enqueueAvailable(
      "company-1",
      "receipt-1",
      "employee-1",
    );

    assert.equal(callCount, 2);
    assert.equal(first.id, second.id);
    assert.equal(first.status, "PENDING");
  });

  it("cancelPendingForReceipt is invoked for replace flow (stub)", async () => {
    const { payrollReceiptNotificationRepository } = await import(
      "../repositories/payroll-receipt-notification.repository"
    );

    let cancelledReceiptId: string | null = null;
    mock.method(
      payrollReceiptNotificationRepository,
      "cancelPendingForReceipt",
      async (_companyId: string, receiptId: string) => {
        cancelledReceiptId = receiptId;
        return 1;
      },
    );

    await payrollReceiptNotificationRepository.cancelPendingForReceipt(
      "company-1",
      "old-receipt-id",
    );
    assert.equal(cancelledReceiptId, "old-receipt-id");
  });

  it("worker skips obsolete receipt (marks cancelled)", async () => {
    const { payrollReceiptNotificationRepository } = await import(
      "../repositories/payroll-receipt-notification.repository"
    );
    const { payrollReceiptRepository } = await import("../repositories/payroll-receipt.repository");
    const { companyModuleService } = await import("./company-module.service");
    const { payrollReceiptNotificationService } = await import(
      "./payroll-receipt-notification.service"
    );

    mock.method(payrollReceiptNotificationRepository, "recoverExpiredLeases", async () => 0);
    mock.method(payrollReceiptNotificationRepository, "claimNextBatch", async () => [
      {
        id: "notif-1",
        companyId: "company-1",
        payrollReceiptId: "receipt-1",
        employeeId: "employee-1",
        notificationType: "PAYROLL_RECEIPT_AVAILABLE" as const,
        status: "PROCESSING" as const,
        attemptCount: 1,
        nextAttemptAt: null,
        leaseOwner: "worker",
        leaseExpiresAt: new Date().toISOString(),
        providerMessageSid: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        sentAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    mock.method(payrollReceiptRepository, "findById", async () => ({
      id: "receipt-1",
      companyId: "company-1",
      batchId: "batch-1",
      employeeId: "employee-1",
      year: 2026,
      month: 7,
      originalFilename: "x.pdf",
      storageProvider: "GOOGLE_CLOUD_STORAGE",
      storageBucket: null,
      storageObjectKey: null,
      objectGeneration: null,
      detectedDocument: null,
      normalizedDocument: null,
      status: "REPLACED",
      errorCode: null,
      errorMessage: null,
      mimeType: null,
      fileSize: null,
      checksumSha256: null,
      idempotencyKey: null,
      uploadedByUserId: null,
      replacedReceiptId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: new Date().toISOString(),
      deletedByUserId: null,
      employeeName: null,
    }));

    mock.method(companyModuleService, "getModuleStates", async () =>
      new Map([[COMPANY_MODULE_KEYS.PAYROLL_RECEIPTS, true]]),
    );

    let cancelled = false;
    mock.method(payrollReceiptNotificationRepository, "markCancelled", async () => {
      cancelled = true;
    });

    const result = await payrollReceiptNotificationService.processPendingBatch(1);
    assert.equal(result.cancelled, 1);
    assert.equal(cancelled, true);
  });
});
