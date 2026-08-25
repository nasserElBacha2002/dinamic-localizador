import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

const baseNotification = {
  id: "notif-1",
  companyId: "company-1",
  recipientId: "recipient-1",
  employeeId: "employee-1",
  operationId: null,
  absenceRequestId: null,
  alertType: "EMPLOYEE_UNAVAILABLE" as const,
  severity: "INFO" as const,
  templateCategory: "OPERATIONAL" as const,
  deduplicationKey: "unavailable:a:1",
  recipientPhone: "+5491112345678",
  contentVariablesJson: JSON.stringify({ "1": "T", "2": "E", "3": "D", "4": "C" }),
  status: "PROCESSING" as const,
  attemptCount: 1,
  nextAttemptAt: null,
  leaseOwner: "worker-1",
  leaseExpiresAt: new Date().toISOString(),
  providerMessageSid: null,
  providerStatus: null,
  activeSendAttemptId: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  occurredAt: new Date().toISOString(),
  sentAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("adminAlertDeliveryService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("skips send when recipient category disabled", async () => {
    const { companyAlertRecipientRepository } = await import(
      "../repositories/company-alert-recipient.repository"
    );
    const { adminAlertNotificationRepository } = await import(
      "../repositories/admin-alert-notification.repository"
    );
    const { adminAlertDeliveryService } = await import("./admin-alert-delivery.service");

    mock.method(adminAlertNotificationRepository, "recoverExpiredLeases", async () => 0);
    mock.method(adminAlertNotificationRepository, "claimNextBatch", async () => [baseNotification]);

    mock.method(companyAlertRecipientRepository, "findById", async () => ({
      id: "recipient-1",
      companyId: "company-1",
      userId: null,
      phoneNumber: "+5491112345678",
      displayName: null,
      isEnabled: true,
      receiveOperationalAlerts: false,
      receiveRequestAlerts: false,
      receiveSecurityAlerts: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    let skippedCode: string | null = null;
    mock.method(adminAlertNotificationRepository, "markSkipped", async (input: {
      errorCode: string;
    }) => {
      skippedCode = input.errorCode;
    });

    const result = await adminAlertDeliveryService.processPendingBatch(1);
    assert.equal(result.skipped, 1);
    assert.equal(skippedCode, "CATEGORY_DISABLED");
  });

  it("REQUEST missing SID → permanent fail without retry loop", async () => {
    const { env } = await import("../config/env");
    const previous = env.TWILIO_ADMIN_REQUEST_ALERT_CONTENT_SID;
    (env as { TWILIO_ADMIN_REQUEST_ALERT_CONTENT_SID?: string }).TWILIO_ADMIN_REQUEST_ALERT_CONTENT_SID =
      "";

    const { companyAlertRecipientRepository } = await import(
      "../repositories/company-alert-recipient.repository"
    );
    const { adminAlertNotificationRepository } = await import(
      "../repositories/admin-alert-notification.repository"
    );
    const { adminAlertDeliveryService } = await import("./admin-alert-delivery.service");

    const requestNotification = {
      ...baseNotification,
      alertType: "ABSENCE_REQUEST_PENDING" as const,
      templateCategory: "REQUEST" as const,
      absenceRequestId: "req-1",
      deduplicationKey: "absence-pending:req-1",
    };

    mock.method(adminAlertNotificationRepository, "recoverExpiredLeases", async () => 0);
    mock.method(adminAlertNotificationRepository, "claimNextBatch", async () => [requestNotification]);
    mock.method(companyAlertRecipientRepository, "findById", async () => ({
      id: "recipient-1",
      companyId: "company-1",
      userId: null,
      phoneNumber: "+5491112345678",
      displayName: null,
      isEnabled: true,
      receiveOperationalAlerts: false,
      receiveRequestAlerts: true,
      receiveSecurityAlerts: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    let failedCode: string | null = null;
    mock.method(adminAlertNotificationRepository, "markFailed", async (input: {
      errorCode: string;
      nextAttemptAt: Date | null;
    }) => {
      failedCode = input.errorCode;
      assert.equal(input.nextAttemptAt, null);
    });

    try {
      const result = await adminAlertDeliveryService.processPendingBatch(1);
      assert.equal(result.failed, 1);
      assert.equal(failedCode, "CONFIG");
    } finally {
      (env as { TWILIO_ADMIN_REQUEST_ALERT_CONTENT_SID?: string }).TWILIO_ADMIN_REQUEST_ALERT_CONTENT_SID =
        previous;
    }
  });

  it("REQUEST recipient with receiveRequestAlerts=false → SKIPPED", async () => {
    const { companyAlertRecipientRepository } = await import(
      "../repositories/company-alert-recipient.repository"
    );
    const { adminAlertNotificationRepository } = await import(
      "../repositories/admin-alert-notification.repository"
    );
    const { adminAlertDeliveryService } = await import("./admin-alert-delivery.service");

    const requestNotification = {
      ...baseNotification,
      alertType: "ABSENCE_REQUEST_PENDING" as const,
      templateCategory: "REQUEST" as const,
      absenceRequestId: "req-1",
      deduplicationKey: "absence-pending:req-1",
    };

    mock.method(adminAlertNotificationRepository, "recoverExpiredLeases", async () => 0);
    mock.method(adminAlertNotificationRepository, "claimNextBatch", async () => [requestNotification]);
    mock.method(companyAlertRecipientRepository, "findById", async () => ({
      id: "recipient-1",
      companyId: "company-1",
      userId: null,
      phoneNumber: "+5491112345678",
      displayName: null,
      isEnabled: true,
      receiveOperationalAlerts: true,
      receiveRequestAlerts: false,
      receiveSecurityAlerts: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    let skippedCode: string | null = null;
    mock.method(adminAlertNotificationRepository, "markSkipped", async (input: { errorCode: string }) => {
      skippedCode = input.errorCode;
    });

    const result = await adminAlertDeliveryService.processPendingBatch(1);
    assert.equal(result.skipped, 1);
    assert.equal(skippedCode, "CATEGORY_DISABLED");
  });
});
