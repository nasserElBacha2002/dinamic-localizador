import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "../database/connection";
import { adminAlertNotificationRepository } from "../repositories/admin-alert-notification.repository";
import { companyAlertRecipientRepository } from "../repositories/company-alert-recipient.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import { deleteCompanyCascade } from "../test-helpers/integration-cleanup";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const uniqueSuffix = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describeDatabaseIntegration("admin alert outbox concurrency and status", () => {
  const createdCompanyIds: string[] = [];

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  after(async () => {
    for (const companyId of createdCompanyIds.splice(0)) {
      await deleteCompanyCascade(companyId);
    }
    await teardownDatabaseIntegration();
  });

  const seed = async () => {
    const suffix = uniqueSuffix();
    const created = await createPlatformCompanyFixture({
      name: `Alert Outbox ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Outbox Owner",
        email: `alert-outbox-${suffix}@integration.test`,
      },
    });
    const companyId = created.data.company.id;
    createdCompanyIds.push(companyId);
    await companySettingsRepository.update(companyId, { adminAlertsEnabled: true });
    const recipient = await companyAlertRecipientRepository.create(companyId, {
      phoneNumber: `+54911${Date.now().toString().slice(-8)}`,
      displayName: "Ops",
      isEnabled: true,
      receiveOperationalAlerts: true,
      receiveRequestAlerts: false,
      receiveSecurityAlerts: true,
    });
    return { companyId, recipient };
  };

  /** Drain claimable rows so claimNextOne cannot pick leftovers from prior cases. */
  const cancelClaimableForCompany = async (companyId: string): Promise<void> => {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        UPDATE whatsapp_admin_alert_notifications
        SET status = N'CANCELLED',
            lease_owner = NULL,
            lease_expires_at = NULL,
            next_attempt_at = NULL,
            last_error_code = N'TEST_CLEANUP',
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND status IN (N'PENDING', N'FAILED', N'PROCESSING', N'SEND_STARTED')
      `);
  };

  const drainGlobalClaimableAdminAlerts = async (): Promise<void> => {
    await getPool().query(`
      UPDATE whatsapp_admin_alert_notifications
      SET status = N'CANCELLED',
          lease_owner = NULL,
          lease_expires_at = NULL,
          next_attempt_at = NULL,
          last_error_code = N'TEST_CLEANUP',
          updated_at = SYSUTCDATETIME()
      WHERE status IN (N'PENDING', N'FAILED', N'PROCESSING', N'SEND_STARTED')
    `);
  };

  it("concurrent claimNextOne assigns at most one lease per notification", async () => {
    await drainGlobalClaimableAdminAlerts();
    const { companyId, recipient } = await seed();
    await cancelClaimableForCompany(companyId);

    const dedup = `unavailable:claim-${uniqueSuffix()}:1`;
    const { notification } = await adminAlertNotificationRepository.enqueue({
      companyId,
      recipientId: recipient.id,
      employeeId: null,
      operationId: null,
      absenceRequestId: null,
      alertType: "EMPLOYEE_UNAVAILABLE",
      severity: "INFO",
      templateCategory: "OPERATIONAL",
      deduplicationKey: dedup,
      recipientPhone: recipient.phoneNumber,
      contentVariablesJson: JSON.stringify({ "1": "T", "2": "E", "3": "D", "4": "C" }),
      occurredAt: new Date(),
    });

    const [claimA, claimB] = await Promise.all([
      adminAlertNotificationRepository.claimNextOne(`worker-a-${randomUUID()}`, 30, 5),
      adminAlertNotificationRepository.claimNextOne(`worker-b-${randomUUID()}`, 30, 5),
    ]);

    const claimedTarget = [claimA, claimB].filter(
      (row) => row?.id.toLowerCase() === notification.id.toLowerCase(),
    );
    assert.equal(claimedTarget.length, 1);
    await cancelClaimableForCompany(companyId);
  });

  it("outbox provider_status advances monotonically by message sid", async () => {
    const { companyId, recipient } = await seed();
    const sid = `SMadmin${randomUUID().replace(/-/g, "")}`;

    const { notification } = await adminAlertNotificationRepository.enqueue({
      companyId,
      recipientId: recipient.id,
      employeeId: null,
      operationId: null,
      absenceRequestId: null,
      alertType: "FORWARDED_LOCATION_REJECTED",
      severity: "WARNING",
      templateCategory: "SECURITY",
      deduplicationKey: `forwarded:status-${uniqueSuffix()}:1`,
      recipientPhone: recipient.phoneNumber,
      contentVariablesJson: JSON.stringify({ "1": "T", "2": "E", "3": "D", "4": "C" }),
      occurredAt: new Date(),
    });

    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, notification.id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("sid", sql.NVarChar(100), sid)
      .query(`
        UPDATE whatsapp_admin_alert_notifications
        SET status = N'SEND_ACCEPTED',
            provider_message_sid = @sid,
            sent_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId
      `);

    await adminAlertNotificationRepository.projectProviderStatusByMessageSid({
      providerMessageSid: sid,
      providerStatus: "sent",
    });

    await adminAlertNotificationRepository.projectProviderStatusByMessageSid({
      providerMessageSid: sid,
      providerStatus: "delivered",
    });

    await adminAlertNotificationRepository.projectProviderStatusByMessageSid({
      providerMessageSid: sid,
      providerStatus: "sent",
    });

    const outbox = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, notification.id)
      .query(`
        SELECT provider_status FROM whatsapp_admin_alert_notifications WHERE id = @id
      `);
    assert.equal(String(outbox.recordset[0]?.provider_status).toLowerCase(), "delivered");
  });

  it("expired lease returns row to claimable PENDING", async () => {
    await drainGlobalClaimableAdminAlerts();
    const { companyId, recipient } = await seed();
    await cancelClaimableForCompany(companyId);

    const { notification } = await adminAlertNotificationRepository.enqueue({
      companyId,
      recipientId: recipient.id,
      employeeId: null,
      operationId: null,
      absenceRequestId: null,
      alertType: "EMPLOYEE_UNAVAILABLE",
      severity: "INFO",
      templateCategory: "OPERATIONAL",
      deduplicationKey: `unavailable:lease-${uniqueSuffix()}:1`,
      recipientPhone: recipient.phoneNumber,
      contentVariablesJson: JSON.stringify({ "1": "T", "2": "E", "3": "D", "4": "C" }),
      occurredAt: new Date(),
    });

    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, notification.id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        UPDATE whatsapp_admin_alert_notifications
        SET status = N'PROCESSING',
            lease_owner = N'stale-worker',
            lease_expires_at = DATEADD(second, -10, SYSUTCDATETIME()),
            updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId
      `);

    const recovered = await adminAlertNotificationRepository.recoverExpiredLeases(50);
    assert.ok(recovered >= 1);

    const after = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, notification.id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT status, lease_owner
        FROM whatsapp_admin_alert_notifications
        WHERE id = @id AND company_id = @companyId
      `);
    assert.equal(String(after.recordset[0]?.status), "PENDING");
    assert.equal(after.recordset[0]?.lease_owner, null);

    const claimed = await adminAlertNotificationRepository.claimNextOne(
      `fresh-worker-${randomUUID()}`,
      30,
      5,
    );
    assert.ok(claimed);
    assert.equal(claimed!.id.toLowerCase(), notification.id.toLowerCase());
    await cancelClaimableForCompany(companyId);
  });

  it("dedup enqueue returns same notification id", async () => {
    const { companyId, recipient } = await seed();
    const dedup = `unavailable:dedup-${uniqueSuffix()}:1`;

    const first = await adminAlertNotificationRepository.enqueue({
      companyId,
      recipientId: recipient.id,
      employeeId: null,
      operationId: null,
      absenceRequestId: null,
      alertType: "EMPLOYEE_UNAVAILABLE",
      severity: "INFO",
      templateCategory: "OPERATIONAL",
      deduplicationKey: dedup,
      recipientPhone: recipient.phoneNumber,
      contentVariablesJson: JSON.stringify({ "1": "T", "2": "E", "3": "D", "4": "C" }),
      occurredAt: new Date(),
    });
    assert.equal(first.created, true);

    const second = await adminAlertNotificationRepository.enqueue({
      companyId,
      recipientId: recipient.id,
      employeeId: null,
      operationId: null,
      absenceRequestId: null,
      alertType: "EMPLOYEE_UNAVAILABLE",
      severity: "INFO",
      templateCategory: "OPERATIONAL",
      deduplicationKey: dedup,
      recipientPhone: recipient.phoneNumber,
      contentVariablesJson: JSON.stringify({ "1": "T", "2": "E", "3": "D", "4": "C" }),
      occurredAt: new Date(),
    });
    assert.equal(second.created, false);
    assert.equal(second.notification.id, first.notification.id);
  });
});
