import sql from "mssql";
import { getPool } from "../../database/connection";
import { adminAlertNotificationRepository } from "../../repositories/admin-alerts/admin-alert-notification.repository";
import { companyAlertRecipientRepository } from "../../repositories/companies/company-alert-recipient.repository";
import { companySettingsRepository } from "../../repositories/companies/company-settings.repository";
import { formatServiceReferenceFromFields } from "../../utils/operations/format-service-reference";
import { formatLocalTime } from "../../utils/attendance/attendance-validation";
import { buildAdminOperationalAlertTemplateVariables } from "../../utils/admin-alert/template-variables";
import {
  buildReplacementManualLinkDedupKey,
  buildVacancyCoveragePrimaryDedupKey,
} from "../../utils/admin-alert/replacement-dedup-keys";
import { buildOperationAdminUrl } from "../../utils/admin-alert/operation-admin-url";
import { resolveAdminAlertContentSid } from "../../utils/admin-alert/content-sid";
import { auditService } from "../audit.service";

export type ReplacementNotificationContext = {
  companyId: string;
  requestId: string;
  requestVersion: number;
  operationId: string;
  employeeWorkdayId: string;
  absentEmployeeId: string;
  absentName: string;
  serviceName: string;
  serviceAddress: string | null;
  serviceLocality: string | null;
  workDate: string;
  expectedStartAt: string;
  expectedEndAt: string | null;
  absenceRequestId?: string | null;
};

export type ReplacementNotificationOutcome = {
  primaryAlertType: "REPLACEMENT_REQUEST" | "EMPLOYEE_UNAVAILABLE" | "NONE";
  candidateCount: number;
  manualFollowUpEnqueued: number;
  primaryEnqueued: number;
  skippedPrimaryDedup: number;
};

const manualHintDetail = "¿Ninguna de las opciones te sirve? Asignar manualmente:";

export const isReplacementInteractiveTemplateConfigured = (): boolean =>
  Boolean(resolveAdminAlertContentSid("OPERATIONAL", "REPLACEMENT_REQUEST"));

/** Interactive primary only when three eligible candidates exist (F10). */
export const shouldUseInteractivePrimary = (candidateCount: number): boolean =>
  candidateCount === 3 && isReplacementInteractiveTemplateConfigured();

const buildInteractiveVariables = async (
  companyId: string,
  context: ReplacementNotificationContext,
  rankedNames: Map<number, string>,
): Promise<Record<string, string>> => {
  const settings = await companySettingsRepository.findByCompanyId(companyId);
  const timezone = settings?.operationTimezone ?? "America/Argentina/Buenos_Aires";
  return {
    "1": context.absentName,
    "2": formatServiceReferenceFromFields({
      serviceName: context.serviceName,
      serviceAddress: context.serviceAddress,
      serviceLocality: context.serviceLocality,
    }),
    "3": context.workDate,
    "4": formatLocalTime(context.expectedStartAt, timezone),
    "5": rankedNames.get(1) ?? "",
    "6": rankedNames.get(2) ?? "",
    "7": rankedNames.get(3) ?? "",
  };
};

const resolvePrimaryDedupKey = (context: ReplacementNotificationContext): string =>
  buildVacancyCoveragePrimaryDedupKey(context.employeeWorkdayId, context.requestVersion);

const loadPersistedPrimaryAlertType = async (
  companyId: string,
  requestId: string,
): Promise<"REPLACEMENT_REQUEST" | "EMPLOYEE_UNAVAILABLE" | null> => {
  const result = await getPool()
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("requestId", sql.UniqueIdentifier, requestId)
    .query(`
      SELECT primary_notification_alert_type AS alert_type
      FROM replacement_requests
      WHERE company_id = @companyId AND id = @requestId
    `);
  const raw = (result.recordset[0] as Record<string, unknown> | undefined)?.alert_type;
  if (raw === "REPLACEMENT_REQUEST" || raw === "EMPLOYEE_UNAVAILABLE") {
    return raw;
  }
  return null;
};

const persistPrimaryNotificationMode = async (
  companyId: string,
  requestId: string,
  alertType: "REPLACEMENT_REQUEST" | "EMPLOYEE_UNAVAILABLE",
): Promise<void> => {
  await getPool()
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("requestId", sql.UniqueIdentifier, requestId)
    .input("alertType", sql.NVarChar(40), alertType)
    .query(`
      UPDATE replacement_requests
      SET primary_notification_alert_type = COALESCE(primary_notification_alert_type, @alertType),
          updated_at = SYSUTCDATETIME()
      WHERE company_id = @companyId AND id = @requestId
    `);
};

const recipientHasBoundNotification = async (
  companyId: string,
  requestId: string,
  requestVersion: number,
  recipientId: string,
): Promise<boolean> => {
  const result = await getPool()
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("requestId", sql.UniqueIdentifier, requestId)
    .input("requestVersion", sql.Int, requestVersion)
    .input("recipientId", sql.UniqueIdentifier, recipientId)
    .query(`
      SELECT TOP 1 1 AS found
      FROM replacement_request_notifications rn
      JOIN whatsapp_admin_alert_notifications an
        ON an.id = rn.notification_id AND an.company_id = rn.company_id
      WHERE rn.company_id = @companyId
        AND rn.request_id = @requestId
        AND rn.recipient_id = @recipientId
        AND rn.request_version = @requestVersion
        AND an.alert_type IN (N'REPLACEMENT_REQUEST', N'EMPLOYEE_UNAVAILABLE')
    `);
  return Boolean(result.recordset[0]);
};

const recipientHasManualFollowUp = async (
  companyId: string,
  recipientId: string,
  deduplicationKey: string,
): Promise<boolean> => {
  const result = await getPool()
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("recipientId", sql.UniqueIdentifier, recipientId)
    .input("dedup", sql.NVarChar(200), deduplicationKey)
    .query(`
      SELECT TOP 1 1 AS found
      FROM whatsapp_admin_alert_notifications
      WHERE company_id = @companyId
        AND recipient_id = @recipientId
        AND deduplication_key = @dedup
        AND alert_type = N'REPLACEMENT_MANUAL_LINK'
    `);
  return Boolean(result.recordset[0]);
};

const enqueuePrimaryForRecipient = async (
  context: ReplacementNotificationContext,
  recipient: { id: string; phoneNumber: string },
  input: {
    alertType: "REPLACEMENT_REQUEST" | "EMPLOYEE_UNAVAILABLE";
    variables: Record<string, string>;
    deduplicationKey: string;
  },
): Promise<"enqueued" | "dedup" | "skipped"> => {
  const already = await recipientHasBoundNotification(
    context.companyId,
    context.requestId,
    context.requestVersion,
    recipient.id,
  );
  if (already) {
    return "skipped";
  }

  const tx = new sql.Transaction(getPool());
  await tx.begin();
  try {
    const outbox = await adminAlertNotificationRepository.enqueue(
      {
        companyId: context.companyId,
        recipientId: recipient.id,
        recipientPhone: recipient.phoneNumber,
        employeeId: context.absentEmployeeId,
        operationId: context.operationId,
        employeeWorkdayId: context.employeeWorkdayId,
        absenceRequestId: context.absenceRequestId ?? null,
        alertType: input.alertType,
        severity: "WARNING",
        templateCategory: "OPERATIONAL",
        deduplicationKey: input.deduplicationKey,
        contentVariablesJson: JSON.stringify(input.variables),
      },
      tx,
    );
    await new sql.Request(tx)
      .input("companyId", sql.UniqueIdentifier, context.companyId)
      .input("requestId", sql.UniqueIdentifier, context.requestId)
      .input("requestVersion", sql.Int, context.requestVersion)
      .input("recipientId", sql.UniqueIdentifier, recipient.id)
      .input("notificationId", sql.UniqueIdentifier, outbox.notification.id)
      .query(`
        IF NOT EXISTS (
          SELECT 1 FROM replacement_request_notifications WITH (UPDLOCK,HOLDLOCK)
          WHERE company_id = @companyId AND request_id = @requestId
            AND recipient_id = @recipientId AND request_version = @requestVersion
        )
        INSERT replacement_request_notifications(
          company_id, request_id, recipient_id, notification_id, request_version
        )
        VALUES(@companyId, @requestId, @recipientId, @notificationId, @requestVersion)
      `);
    await tx.commit();
    return outbox.created ? "enqueued" : "dedup";
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      /* settled */
    }
    throw error;
  }
};

const enqueueManualFollowUpForRecipient = async (
  context: ReplacementNotificationContext,
  recipient: { id: string; phoneNumber: string },
): Promise<boolean> => {
  const dedup = buildReplacementManualLinkDedupKey(context.requestId, context.requestVersion);
  if (await recipientHasManualFollowUp(context.companyId, recipient.id, dedup)) {
    return false;
  }
  const manualUrl = buildOperationAdminUrl(context.operationId, {
    workDate: context.workDate,
    employeeWorkdayId: context.employeeWorkdayId,
  });
  const variables = buildAdminOperationalAlertTemplateVariables("REPLACEMENT_MANUAL_LINK", {
    employeeName: context.absentName,
    serviceName: context.serviceName,
    serviceAddress: context.serviceAddress,
    serviceLocality: context.serviceLocality,
    scheduledStart: context.expectedStartAt,
    scheduledEnd: context.expectedEndAt,
    absenceDetailUrl: manualUrl,
    operationTimezone: null,
  });
  variables["1"] = manualHintDetail;
  variables["2"] = manualUrl;
  variables["3"] = "";
  variables["4"] = "";

  const { created } = await adminAlertNotificationRepository.enqueue({
    companyId: context.companyId,
    recipientId: recipient.id,
    recipientPhone: recipient.phoneNumber,
    employeeId: context.absentEmployeeId,
    operationId: context.operationId,
    employeeWorkdayId: context.employeeWorkdayId,
    absenceRequestId: context.absenceRequestId ?? null,
    alertType: "REPLACEMENT_MANUAL_LINK",
    severity: "INFO",
    templateCategory: "OPERATIONAL",
    deduplicationKey: dedup,
    contentVariablesJson: JSON.stringify(variables),
  });
  return created;
};

export const materializeReplacementVacancyNotifications = async (
  context: ReplacementNotificationContext,
  candidateRanks: number[],
): Promise<ReplacementNotificationOutcome> => {
  const candidateCount = candidateRanks.length;
  const rankedNames = new Map<number, string>();
  if (candidateCount > 0) {
    const names = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, context.companyId)
      .input("requestId", sql.UniqueIdentifier, context.requestId)
      .input("offerVersion", sql.Int, context.requestVersion)
      .query(`
        SELECT c.rank, e.name
        FROM replacement_request_candidates c
        JOIN employees e ON e.id = c.employee_id AND e.company_id = c.company_id
        WHERE c.company_id = @companyId AND c.request_id = @requestId
          AND c.offer_version = @offerVersion
          AND c.status = N'OFFERED'
        ORDER BY c.rank
      `);
    for (const row of names.recordset as Array<Record<string, unknown>>) {
      rankedNames.set(Number(row.rank), String(row.name));
    }
  }

  const persistedMode = await loadPersistedPrimaryAlertType(context.companyId, context.requestId);
  const useInteractive =
    persistedMode === "REPLACEMENT_REQUEST" ||
    (!persistedMode && shouldUseInteractivePrimary(candidateCount));
  const useFallbackPrimary =
    persistedMode === "EMPLOYEE_UNAVAILABLE" ||
    (!persistedMode && !useInteractive);

  const primaryDedup = resolvePrimaryDedupKey(context);
  const recipients = await companyAlertRecipientRepository.findEnabledRecipients(
    context.companyId,
    "OPERATIONAL",
  );

  let primaryEnqueued = 0;
  let skippedPrimaryDedup = 0;
  let primaryAlertType: ReplacementNotificationOutcome["primaryAlertType"] = "NONE";

  if (useInteractive) {
    const variables = await buildInteractiveVariables(context.companyId, context, rankedNames);
    primaryAlertType = "REPLACEMENT_REQUEST";
    for (const recipient of recipients) {
      const result = await enqueuePrimaryForRecipient(context, recipient, {
        alertType: "REPLACEMENT_REQUEST",
        variables,
        deduplicationKey: primaryDedup,
      });
      if (result === "enqueued") primaryEnqueued += 1;
      else if (result === "dedup" || result === "skipped") skippedPrimaryDedup += 1;
    }
    await persistPrimaryNotificationMode(context.companyId, context.requestId, "REPLACEMENT_REQUEST");
  } else if (useFallbackPrimary) {
    const reason =
      candidateCount === 0
        ? "Sin candidatos elegibles para reemplazo automático"
        : candidateCount < 3
          ? "Se requiere asignación manual (menos de tres candidatos elegibles)"
          : "Plantilla interactiva de reemplazo no configurada";
    const manualUrl = buildOperationAdminUrl(context.operationId, {
      workDate: context.workDate,
      employeeWorkdayId: context.employeeWorkdayId,
    });
    const payload = {
      employeeName: context.absentName,
      serviceName: context.serviceName,
      serviceAddress: context.serviceAddress,
      serviceLocality: context.serviceLocality,
      scheduledStart: context.expectedStartAt,
      scheduledEnd: context.expectedEndAt,
    };
    const variables = buildAdminOperationalAlertTemplateVariables("EMPLOYEE_UNAVAILABLE", payload);
    variables["3"] = `${variables["3"]} · ${reason}`;
    variables["4"] = manualUrl;
    primaryAlertType = "EMPLOYEE_UNAVAILABLE";
    for (const recipient of recipients) {
      const result = await enqueuePrimaryForRecipient(context, recipient, {
        alertType: "EMPLOYEE_UNAVAILABLE",
        variables,
        deduplicationKey: primaryDedup,
      });
      if (result === "enqueued") primaryEnqueued += 1;
      else if (result === "dedup" || result === "skipped") skippedPrimaryDedup += 1;
    }
    await persistPrimaryNotificationMode(context.companyId, context.requestId, "EMPLOYEE_UNAVAILABLE");
  }

  let manualFollowUpEnqueued = 0;
  if (useInteractive) {
    for (const recipient of recipients) {
      if (await enqueueManualFollowUpForRecipient(context, recipient)) {
        manualFollowUpEnqueued += 1;
      }
    }
  }

  const primaryReady = recipients.length > 0 && (
    await Promise.all(
      recipients.map((recipient) =>
        recipientHasBoundNotification(
          context.companyId,
          context.requestId,
          context.requestVersion,
          recipient.id,
        ),
      ),
    )
  ).every(Boolean);

  const manualReady =
    !useInteractive ||
    (recipients.length > 0 &&
      (
        await Promise.all(
          recipients.map((recipient) =>
            recipientHasManualFollowUp(
              context.companyId,
              recipient.id,
              buildReplacementManualLinkDedupKey(context.requestId, context.requestVersion),
            ),
          ),
        )
      ).every(Boolean));

  if (primaryReady && manualReady && recipients.length > 0) {
    const finalize = new sql.Transaction(getPool());
    await finalize.begin();
    try {
      const updated = await new sql.Request(finalize)
        .input("companyId", sql.UniqueIdentifier, context.companyId)
        .input("requestId", sql.UniqueIdentifier, context.requestId)
        .input("recipientCount", sql.Int, recipients.length)
        .input("requestVersion", sql.Int, context.requestVersion)
        .query(`
          UPDATE replacement_requests
          SET notifications_materialized_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME()
          WHERE company_id = @companyId AND id = @requestId AND status IN (N'PENDING', N'FAILED')
            AND request_version = @requestVersion
            AND notifications_materialized_at IS NULL
            AND (SELECT COUNT(*) FROM replacement_request_notifications
                 WHERE company_id = @companyId AND request_id = @requestId
                   AND request_version = @requestVersion) >= @recipientCount
        `);
      if ((updated.rowsAffected[0] ?? 0) > 0) {
        await auditService.log(
          context.companyId,
          {
            action: "REPLACEMENT_NOTIFICATION_MATERIALIZED",
            entityType: "replacement_request",
            entityId: context.requestId,
            newData: {
              recipientCount: recipients.length,
              candidateCount,
              primaryAlertType,
              manualFollowUpEnqueued,
              primaryEnqueued,
              skippedPrimaryDedup,
            },
          },
          finalize,
        );
      }
      await finalize.commit();
    } catch (error) {
      try {
        await finalize.rollback();
      } catch {
        /* settled */
      }
      throw error;
    }
  }

  return {
    primaryAlertType:
      primaryAlertType === "NONE" && persistedMode ? persistedMode : primaryAlertType,
    candidateCount,
    manualFollowUpEnqueued,
    primaryEnqueued,
    skippedPrimaryDedup,
  };
};