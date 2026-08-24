import {
  adminAlertTypeDefaultCategory,
  type AdminAlertSeverity,
  type AdminAlertTemplateCategory,
} from "../constants/admin-alert";
import { companyRepository } from "../repositories/company.repository";
import { companyAlertRecipientRepository } from "../repositories/company-alert-recipient.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { adminAlertNotificationRepository } from "../repositories/admin-alert-notification.repository";
import type { AdminAlertEmitInput, AdminAlertEmitResult } from "../types/admin-alert";
import { buildAdminAlertTemplateVariables } from "../utils/admin-alert/template-variables";
import { logAdminAlertEvent } from "../utils/admin-alert/observability";
import { normalizePhoneNumber } from "../utils/phone";

const isValidE164 = (phone: string): boolean => /^\+[1-9]\d{6,14}$/.test(phone);

export const adminAlertService = {
  async emit(input: AdminAlertEmitInput): Promise<AdminAlertEmitResult> {
    const result: AdminAlertEmitResult = {
      enqueued: 0,
      dedupSkipped: 0,
      recipientSkipped: 0,
    };

    const company = await companyRepository.findById(input.companyId);
    if (!company) {
      logAdminAlertEvent("ADMIN_ALERT_RECIPIENT_SKIPPED", {
        companyId: input.companyId,
        alertType: input.type,
        reason: "COMPANY_NOT_FOUND",
      });
      return result;
    }

    const settings = await companySettingsRepository.findByCompanyId(input.companyId);
    if (!settings?.adminAlertsEnabled) {
      logAdminAlertEvent("ADMIN_ALERT_RECIPIENT_SKIPPED", {
        companyId: input.companyId,
        alertType: input.type,
        reason: "ADMIN_ALERTS_DISABLED",
      });
      return result;
    }

    const category: AdminAlertTemplateCategory =
      input.category ?? adminAlertTypeDefaultCategory(input.type);
    const severity: AdminAlertSeverity = input.severity ?? "INFO";

    const recipients = await companyAlertRecipientRepository.findEnabledRecipients(
      input.companyId,
      category,
    );
    if (recipients.length === 0) {
      logAdminAlertEvent("ADMIN_ALERT_RECIPIENT_SKIPPED", {
        companyId: input.companyId,
        alertType: input.type,
        reason: "NO_RECIPIENTS",
      });
      return result;
    }

    const templateVariables = buildAdminAlertTemplateVariables(
      input.type,
      category,
      input.payload,
    );
    const contentVariablesJson = JSON.stringify(templateVariables);
    const occurredAt = input.occurredAt ?? new Date();

    for (const recipient of recipients) {
      let normalizedPhone: string;
      try {
        normalizedPhone = normalizePhoneNumber(recipient.phoneNumber);
      } catch {
        result.recipientSkipped += 1;
        logAdminAlertEvent("ADMIN_ALERT_RECIPIENT_SKIPPED", {
          companyId: input.companyId,
          recipientId: recipient.id,
          alertType: input.type,
          reason: "INVALID_PHONE",
        });
        continue;
      }

      if (!isValidE164(normalizedPhone)) {
        result.recipientSkipped += 1;
        logAdminAlertEvent("ADMIN_ALERT_RECIPIENT_SKIPPED", {
          companyId: input.companyId,
          recipientId: recipient.id,
          alertType: input.type,
          reason: "INVALID_E164",
        });
        continue;
      }

      const { notification, created } = await adminAlertNotificationRepository.enqueue({
        companyId: input.companyId,
        recipientId: recipient.id,
        employeeId: input.employeeId ?? null,
        operationId: input.operationId ?? null,
        absenceRequestId: input.absenceRequestId ?? null,
        alertType: input.type,
        severity,
        templateCategory: category,
        deduplicationKey: input.deduplicationKey,
        recipientPhone: normalizedPhone,
        contentVariablesJson,
        occurredAt,
      });

      if (created) {
        result.enqueued += 1;
        logAdminAlertEvent("ADMIN_ALERT_ENQUEUED", {
          companyId: input.companyId,
          recipientId: recipient.id,
          alertType: input.type,
          outboxId: notification.id,
          operationId: input.operationId ?? null,
          employeeId: input.employeeId ?? null,
          deduplicationKey: input.deduplicationKey,
        });
      } else {
        result.dedupSkipped += 1;
        logAdminAlertEvent("ADMIN_ALERT_DEDUP_SKIPPED", {
          companyId: input.companyId,
          recipientId: recipient.id,
          alertType: input.type,
          outboxId: notification.id,
          deduplicationKey: input.deduplicationKey,
        });
      }
    }

    return result;
  },
};
