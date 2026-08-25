import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

describe("adminAlertService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("skips enqueue when company not found", async () => {
    const { companyRepository } = await import("../repositories/company.repository");
    const { adminAlertService } = await import("./admin-alert.service");

    mock.method(companyRepository, "findById", async () => null);

    const result = await adminAlertService.emit({
      companyId: "00000000-0000-0000-0000-000000000001",
      type: "EMPLOYEE_UNAVAILABLE",
      deduplicationKey: "unavailable:a:1",
      payload: { employeeName: "Test" },
    });

    assert.equal(result.enqueued, 0);
  });

  it("skips enqueue when admin alerts disabled", async () => {
    const { companyRepository } = await import("../repositories/company.repository");
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { adminAlertService } = await import("./admin-alert.service");

    mock.method(companyRepository, "findById", async () => ({
      id: "company-1",
      name: "Co",
      status: "ACTIVE",
    }));
    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      companyId: "company-1",
      adminAlertsEnabled: false,
    }));

    const result = await adminAlertService.emit({
      companyId: "company-1",
      type: "EMPLOYEE_UNAVAILABLE",
      deduplicationKey: "unavailable:a:1",
      payload: { employeeName: "Test" },
    });

    assert.equal(result.enqueued, 0);
  });

  it("skips when no enabled recipients", async () => {
    const { companyRepository } = await import("../repositories/company.repository");
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { companyAlertRecipientRepository } = await import(
      "../repositories/company-alert-recipient.repository"
    );
    const { adminAlertService } = await import("./admin-alert.service");

    mock.method(companyRepository, "findById", async () => ({
      id: "company-1",
      name: "Co",
      status: "ACTIVE",
    }));
    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      companyId: "company-1",
      adminAlertsEnabled: true,
    }));
    mock.method(companyAlertRecipientRepository, "findEnabledRecipients", async () => []);

    const result = await adminAlertService.emit({
      companyId: "company-1",
      type: "EMPLOYEE_UNAVAILABLE",
      deduplicationKey: "unavailable:a:1",
      payload: { employeeName: "Test" },
    });

    assert.equal(result.enqueued, 0);
  });

  it("enqueues for multiple recipients and skips invalid phone", async () => {
    const { companyRepository } = await import("../repositories/company.repository");
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { companyAlertRecipientRepository } = await import(
      "../repositories/company-alert-recipient.repository"
    );
    const { adminAlertNotificationRepository } = await import(
      "../repositories/admin-alert-notification.repository"
    );
    const { adminAlertService } = await import("./admin-alert.service");

    mock.method(companyRepository, "findById", async () => ({
      id: "company-1",
      name: "Co",
      status: "ACTIVE",
    }));
    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      companyId: "company-1",
      adminAlertsEnabled: true,
    }));
    mock.method(companyAlertRecipientRepository, "findEnabledRecipients", async () => [
      {
        id: "r1",
        companyId: "company-1",
        userId: null,
        phoneNumber: "+5491112345678",
        displayName: "Admin",
        isEnabled: true,
        receiveOperationalAlerts: true,
        receiveRequestAlerts: false,
        receiveSecurityAlerts: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "r2",
        companyId: "company-1",
        userId: null,
        phoneNumber: "invalid",
        displayName: "Bad",
        isEnabled: true,
        receiveOperationalAlerts: true,
        receiveRequestAlerts: false,
        receiveSecurityAlerts: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    let enqueueCalls = 0;
    mock.method(adminAlertNotificationRepository, "enqueue", async () => {
      enqueueCalls += 1;
      return {
        notification: { id: `n${enqueueCalls}` },
        created: enqueueCalls === 1,
      };
    });

    const result = await adminAlertService.emit({
      companyId: "company-1",
      type: "FORWARDED_LOCATION_REJECTED",
      deduplicationKey: "forwarded:e:1",
      payload: { employeeName: "Emp" },
    });

    assert.equal(result.enqueued, 1);
    assert.equal(result.recipientSkipped, 1);
    assert.equal(enqueueCalls, 1);
  });

  it("dedup skips when outbox already exists", async () => {
    const { companyRepository } = await import("../repositories/company.repository");
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { companyAlertRecipientRepository } = await import(
      "../repositories/company-alert-recipient.repository"
    );
    const { adminAlertNotificationRepository } = await import(
      "../repositories/admin-alert-notification.repository"
    );
    const { adminAlertService } = await import("./admin-alert.service");

    mock.method(companyRepository, "findById", async () => ({
      id: "company-1",
      name: "Co",
      status: "ACTIVE",
    }));
    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      companyId: "company-1",
      adminAlertsEnabled: true,
    }));
    mock.method(companyAlertRecipientRepository, "findEnabledRecipients", async () => [
      {
        id: "r1",
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
      },
    ]);
    mock.method(adminAlertNotificationRepository, "enqueue", async () => ({
      notification: { id: "existing" },
      created: false,
    }));

    const result = await adminAlertService.emit({
      companyId: "company-1",
      type: "EMPLOYEE_UNAVAILABLE",
      deduplicationKey: "unavailable:a:1",
      payload: { employeeName: "Emp" },
    });

    assert.equal(result.enqueued, 0);
    assert.equal(result.dedupSkipped, 1);
  });

  it("skips recipients created after the domain event", async () => {
    const { companyRepository } = await import("../repositories/company.repository");
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { companyAlertRecipientRepository } = await import(
      "../repositories/company-alert-recipient.repository"
    );
    const { adminAlertNotificationRepository } = await import(
      "../repositories/admin-alert-notification.repository"
    );
    const { adminAlertService } = await import("./admin-alert.service");

    mock.method(companyRepository, "findById", async () => ({
      id: "company-1",
      name: "Co",
      status: "ACTIVE",
    }));
    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      companyId: "company-1",
      adminAlertsEnabled: true,
      adminAlertsEnabledAt: "2026-01-01T00:00:00.000Z",
    }));
    mock.method(companyAlertRecipientRepository, "findEnabledRecipients", async () => [
      {
        id: "r-late",
        companyId: "company-1",
        userId: null,
        phoneNumber: "+5491112345678",
        displayName: "Late",
        isEnabled: true,
        receiveOperationalAlerts: true,
        receiveRequestAlerts: false,
        receiveSecurityAlerts: true,
        createdAt: "2026-09-02T00:00:00.000Z",
        updatedAt: "2026-09-02T00:00:00.000Z",
      },
    ]);

    let enqueueCalls = 0;
    mock.method(adminAlertNotificationRepository, "enqueue", async () => {
      enqueueCalls += 1;
      return { notification: { id: "n1" }, created: true };
    });

    const result = await adminAlertService.emit({
      companyId: "company-1",
      type: "EMPLOYEE_UNAVAILABLE",
      deduplicationKey: "unavailable:a:1",
      occurredAt: new Date("2026-09-01T12:00:00.000Z"),
      payload: { employeeName: "Emp" },
    });

    assert.equal(result.enqueued, 0);
    assert.equal(result.recipientSkipped, 1);
    assert.equal(enqueueCalls, 0);
  });

  it("enqueues REQUEST alerts for receiveRequestAlerts recipients", async () => {
    const { companyRepository } = await import("../repositories/company.repository");
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { companyAlertRecipientRepository } = await import(
      "../repositories/company-alert-recipient.repository"
    );
    const { adminAlertNotificationRepository } = await import(
      "../repositories/admin-alert-notification.repository"
    );
    const { adminAlertService } = await import("./admin-alert.service");

    mock.method(companyRepository, "findById", async () => ({
      id: "company-1",
      name: "Co",
      status: "ACTIVE",
    }));
    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      companyId: "company-1",
      adminAlertsEnabled: true,
      adminAlertsEnabledAt: "2026-01-01T00:00:00.000Z",
    }));
    mock.method(companyAlertRecipientRepository, "findEnabledRecipients", async () => [
      {
        id: "r-req",
        companyId: "company-1",
        userId: null,
        phoneNumber: "+5491112345678",
        displayName: "HR",
        isEnabled: true,
        receiveOperationalAlerts: false,
        receiveRequestAlerts: true,
        receiveSecurityAlerts: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    let enqueueInput: Record<string, unknown> | null = null;
    mock.method(adminAlertNotificationRepository, "enqueue", async (input: Record<string, unknown>) => {
      enqueueInput = input;
      return { notification: { id: "n-req" }, created: true };
    });

    const result = await adminAlertService.emit({
      companyId: "company-1",
      type: "ABSENCE_REQUEST_PENDING",
      category: "REQUEST",
      employeeId: "emp-1",
      absenceRequestId: "req-1",
      deduplicationKey: "absence-pending:req-1",
      occurredAt: new Date("2026-09-01T12:00:00.000Z"),
      payload: {
        employeeName: "Juan Pérez",
        absenceTypeName: "Vacaciones",
        startDate: "2026-09-01",
        endDate: "2026-09-07",
        statusLabel: "Pendiente de revisión",
      },
    });

    assert.equal(result.enqueued, 1);
    assert.ok(enqueueInput);
    assert.equal(enqueueInput!.alertType, "ABSENCE_REQUEST_PENDING");
    assert.equal(enqueueInput!.templateCategory, "REQUEST");
    assert.equal(enqueueInput!.absenceRequestId, "req-1");
    const vars = JSON.parse(String(enqueueInput!.contentVariablesJson)) as Record<string, string>;
    assert.equal(vars["1"], "Solicitud de vacaciones");
    assert.equal(vars["4"], "Pendiente de revisión");
  });
});
