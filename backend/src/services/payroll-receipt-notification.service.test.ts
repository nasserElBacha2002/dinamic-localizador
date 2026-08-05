import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { COMPANY_MODULE_KEYS } from "../constants/company-modules";

const baseNotification = {
  id: "notif-1",
  companyId: "company-1",
  payrollReceiptId: "receipt-1",
  employeeId: "employee-1",
  notificationType: "PAYROLL_RECEIPT_AVAILABLE" as const,
  status: "PROCESSING" as const,
  attemptCount: 1,
  nextAttemptAt: null,
  leaseOwner: "payroll-receipt-notif-1",
  leaseExpiresAt: new Date().toISOString(),
  providerMessageSid: null,
  providerStatus: null,
  cancelRequestedAt: null,
  activeSendAttemptId: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  sentAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const associatedReceipt = {
  id: "receipt-1",
  companyId: "company-1",
  batchId: "batch-1",
  employeeId: "employee-1",
  year: 2026,
  month: 7,
  originalFilename: "x.pdf",
  storageProvider: "GOOGLE_CLOUD_STORAGE",
  storageBucket: null,
  storageObjectKey: "payroll/x.pdf",
  objectGeneration: null,
  detectedDocument: null,
  normalizedDocument: null,
  status: "ASSOCIATED",
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
  deletedAt: null,
  deletedByUserId: null,
  employeeName: null,
};

describe("payrollReceiptNotificationService", () => {
  afterEach(() => {
    mock.restoreAll();
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

    mock.method(payrollReceiptNotificationRepository, "reconcileTerminalStates", async () => 0);
    mock.method(payrollReceiptNotificationRepository, "recoverExpiredLeases", async () => 0);
    mock.method(payrollReceiptNotificationRepository, "claimNextOne", async () => ({
      ...baseNotification,
    }));
    mock.method(payrollReceiptNotificationRepository, "isCancelRequested", async () => false);

    mock.method(payrollReceiptRepository, "findById", async () => ({
      ...associatedReceipt,
      storageObjectKey: null,
      status: "REPLACED",
      deletedAt: new Date().toISOString(),
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

  it("ambiguous Twilio failure after beginSendAttempt → reconciliation; claim again does not call Twilio", async () => {
    const { env } = await import("../config/env");
    const previousContentSid = env.TWILIO_PAYROLL_RECEIPT_AVAILABLE_CONTENT_SID;
    env.TWILIO_PAYROLL_RECEIPT_AVAILABLE_CONTENT_SID = "HX_TEST_PAYROLL_RECEIPT";

    const { payrollReceiptNotificationRepository } = await import(
      "../repositories/payroll-receipt-notification.repository"
    );
    const { payrollReceiptRepository } = await import("../repositories/payroll-receipt.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { companyModuleService } = await import("./company-module.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");
    const { payrollReceiptNotificationService } = await import(
      "./payroll-receipt-notification.service"
    );

    try {
    mock.method(payrollReceiptNotificationRepository, "reconcileTerminalStates", async () => 0);
    mock.method(payrollReceiptNotificationRepository, "recoverExpiredLeases", async () => 0);

    let claimCount = 0;
    mock.method(payrollReceiptNotificationRepository, "claimNextOne", async () => {
      claimCount += 1;
      // First batch tick claims once; second processPendingBatch finds nothing claimable
      // (RECONCILIATION_REQUIRED is not claimable) — simulate empty second claim.
      if (claimCount === 1) {
        return { ...baseNotification, leaseOwner: `payroll-receipt-notif-${process.pid}` };
      }
      return null;
    });

    mock.method(payrollReceiptNotificationRepository, "isCancelRequested", async () => false);
    mock.method(payrollReceiptRepository, "findById", async () => associatedReceipt);
    mock.method(companyModuleService, "getModuleStates", async () =>
      new Map([[COMPANY_MODULE_KEYS.PAYROLL_RECEIPTS, true]]),
    );
    mock.method(employeeRepository, "findById", async () => ({
      id: "employee-1",
      companyId: "company-1",
      name: "Test",
      phoneNumber: "+5491100000000",
      active: true,
    }));

    mock.method(payrollReceiptNotificationRepository, "beginSendAttempt", async () => ({
      id: "attempt-1",
      companyId: "company-1",
      notificationId: "notif-1",
      attemptNumber: 1,
      status: "STARTED" as const,
      providerMessageSid: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    let twilioCalls = 0;
    mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => {
      twilioCalls += 1;
      const err = new Error("socket hang up");
      (err as Error & { code: string }).code = "ECONNRESET";
      throw err;
    });

    let ambiguous = false;
    let reconciliation = false;
    mock.method(payrollReceiptNotificationRepository, "markSendAttemptAmbiguous", async () => {
      ambiguous = true;
    });
    mock.method(payrollReceiptNotificationRepository, "markReconciliationRequired", async () => {
      reconciliation = true;
    });

    const first = await payrollReceiptNotificationService.processPendingBatch(1);
    assert.equal(first.reconciliation, 1);
    assert.equal(ambiguous, true);
    assert.equal(reconciliation, true);
    assert.equal(twilioCalls, 1);

    // Second worker tick: claim returns null (RECONCILIATION_REQUIRED not claimable)
    const second = await payrollReceiptNotificationService.processPendingBatch(1);
    assert.equal(second.processed, 0);
    assert.equal(twilioCalls, 1);
    } finally {
      env.TWILIO_PAYROLL_RECEIPT_AVAILABLE_CONTENT_SID = previousContentSid;
    }
  });
});
