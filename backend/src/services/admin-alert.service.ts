import {
  adminAlertTypeDefaultCategory,
  type AdminAlertSeverity,
  type AdminAlertTemplateCategory,
} from "../constants/admin-alert";
import { companyRepository } from "../repositories/company.repository";
import { companyAlertRecipientRepository } from "../repositories/company-alert-recipient.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { adminAlertNotificationRepository } from "../repositories/admin-alert-notification.repository";
import type {
  AdminAlertEmitInput,
  AdminAlertEmitResult,
  AdminAlertOutboxObligation,
} from "../types/admin-alert";
import { buildAdminAlertTemplateVariables } from "../utils/admin-alert/template-variables";
import { logAdminAlertEvent } from "../utils/admin-alert/observability";
import { normalizePhoneNumber } from "../utils/phone";

const isValidE164 = (phone: string): boolean => /^\+[1-9]\d{6,14}$/.test(phone);

const enqueueOneRecipient = async (input: {
  companyId: string;
  recipientId: string;
  recipientPhone: string;
  alertType: AdminAlertEmitInput["type"];
  severity: AdminAlertSeverity;
  category: AdminAlertTemplateCategory;
  employeeId: string | null;
  operationId: string | null;
  absenceRequestId: string | null;
  deduplicationKey: string;
  contentVariablesJson: string;
  occurredAt: Date;
}): Promise<"enqueued" | "dedupSkipped" | "recipientSkipped"> => {
  let normalizedPhone: string;
  try {
    normalizedPhone = normalizePhoneNumber(input.recipientPhone);
  } catch {
    logAdminAlertEvent("ADMIN_ALERT_RECIPIENT_SKIPPED", {
      companyId: input.companyId,
      recipientId: input.recipientId,
      alertType: input.alertType,
      reason: "INVALID_PHONE",
    });
    return "recipientSkipped";
  }

  if (!isValidE164(normalizedPhone)) {
    logAdminAlertEvent("ADMIN_ALERT_RECIPIENT_SKIPPED", {
      companyId: input.companyId,
      recipientId: input.recipientId,
      alertType: input.alertType,
      reason: "INVALID_E164",
    });
    return "recipientSkipped";
  }

  const { notification, created } = await adminAlertNotificationRepository.enqueue({
    companyId: input.companyId,
    recipientId: input.recipientId,
    employeeId: input.employeeId,
    operationId: input.operationId,
    absenceRequestId: input.absenceRequestId,
    alertType: input.alertType,
    severity: input.severity,
    templateCategory: input.category,
    deduplicationKey: input.deduplicationKey,
    recipientPhone: normalizedPhone,
    contentVariablesJson: input.contentVariablesJson,
    occurredAt: input.occurredAt,
  });

  if (created) {
    logAdminAlertEvent("ADMIN_ALERT_ENQUEUED", {
      companyId: input.companyId,
      recipientId: input.recipientId,
      alertType: input.alertType,
      outboxId: notification.id,
      operationId: input.operationId,
      employeeId: input.employeeId,
      absenceRequestId: input.absenceRequestId,
      deduplicationKey: input.deduplicationKey,
    });
    return "enqueued";
  }

  logAdminAlertEvent("ADMIN_ALERT_DEDUP_SKIPPED", {
    companyId: input.companyId,
    recipientId: input.recipientId,
    alertType: input.alertType,
    outboxId: notification.id,
    absenceRequestId: input.absenceRequestId,
    deduplicationKey: input.deduplicationKey,
  });
  return "dedupSkipped";
};

export const adminAlertService = {
  /**
   * Live emit: resolve currently enabled recipients for the category,
   * excluding those created after the domain event occurredAt.
   */
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
    const occurredAt = input.occurredAt ?? new Date();

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
    const occurredMs = occurredAt.getTime();

    for (const recipient of recipients) {
      if (new Date(recipient.createdAt).getTime() > occurredMs) {
        result.recipientSkipped += 1;
        logAdminAlertEvent("ADMIN_ALERT_RECIPIENT_SKIPPED", {
          companyId: input.companyId,
          recipientId: recipient.id,
          alertType: input.type,
          reason: "RECIPIENT_CREATED_AFTER_EVENT",
        });
        continue;
      }

      const outcome = await enqueueOneRecipient({
        companyId: input.companyId,
        recipientId: recipient.id,
        recipientPhone: recipient.phoneNumber,
        alertType: input.type,
        severity,
        category,
        employeeId: input.employeeId ?? null,
        operationId: input.operationId ?? null,
        absenceRequestId: input.absenceRequestId ?? null,
        deduplicationKey: input.deduplicationKey,
        contentVariablesJson,
        occurredAt,
      });

      if (outcome === "enqueued") {
        result.enqueued += 1;
      } else if (outcome === "dedupSkipped") {
        result.dedupSkipped += 1;
      } else {
        result.recipientSkipped += 1;
      }
    }

    return result;
  },

  /**
   * Reconciliation path: enqueue a single already-identified event×recipient obligation.
   * Relies on UNIQUE(company_id, deduplication_key, recipient_id) for concurrent workers.
   */
  async enqueueObligation(obligation: AdminAlertOutboxObligation): Promise<AdminAlertEmitResult> {
    const result: AdminAlertEmitResult = {
      enqueued: 0,
      dedupSkipped: 0,
      recipientSkipped: 0,
    };

    const settings = await companySettingsRepository.findByCompanyId(obligation.companyId);
    if (!settings?.adminAlertsEnabled) {
      result.recipientSkipped += 1;
      return result;
    }

    const contentVariablesJson = JSON.stringify(
      buildAdminAlertTemplateVariables(
        obligation.alertType,
        obligation.category,
        obligation.payload,
      ),
    );

    const outcome = await enqueueOneRecipient({
      companyId: obligation.companyId,
      recipientId: obligation.recipientId,
      recipientPhone: obligation.recipientPhone,
      alertType: obligation.alertType,
      severity: obligation.severity,
      category: obligation.category,
      employeeId: obligation.employeeId,
      operationId: obligation.operationId,
      absenceRequestId: obligation.absenceRequestId,
      deduplicationKey: obligation.deduplicationKey,
      contentVariablesJson,
      occurredAt: new Date(obligation.occurredAt),
    });

    if (outcome === "enqueued") {
      result.enqueued += 1;
    } else if (outcome === "dedupSkipped") {
      result.dedupSkipped += 1;
    } else {
      result.recipientSkipped += 1;
    }

    return result;
  },
};
