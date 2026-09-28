import { randomUUID } from "node:crypto";
import sql from "mssql";
import { env } from "../config/env";
import {
  DAILY_ATTENDANCE_REPORT_CATCHUP_MAX_DAYS,
  DAILY_ATTENDANCE_REPORT_TEMPLATE_VERSION,
} from "../constants/daily-attendance-report";
import { getPool } from "../database/connection";
import { companyAlertRecipientRepository } from "../repositories/company-alert-recipient.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { dailyAttendanceReportDeliveryRepository } from "../repositories/daily-attendance-report-delivery.repository";
import { dailyAttendanceReportRunRepository } from "../repositories/daily-attendance-report-run.repository";
import { sendEmail } from "./email.service";
import { dailyAttendanceReportAggregator } from "./daily-attendance-report-aggregator.service";
import { buildDailyAttendanceReportEmail } from "./daily-attendance-report-email.builder";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import {
  hasLocalReportTimeArrived,
  listCatchUpReportDates,
  normalizeReportTimeHHmm,
  resolveReportDateLocal,
} from "../utils/daily-attendance-report-time";
import { validateManualReportDate } from "../utils/daily-attendance-report-manual-date";
import { logDailyAttendanceReportEvent } from "../utils/daily-attendance-report-observability";
import { assertDailyReportAudienceSchemaReady } from "../utils/daily-attendance-report-schema-guard";
import type { DailyAttendanceReportRun } from "../types/daily-attendance-report";
import { buildDailyAttendanceReportXlsx, DAILY_XLSX_CONTENT_TYPE } from "./daily-attendance-report-xlsx.builder";

/**
 * SMTP delivery is at-least-once: if the provider accepts a message but persistence of
 * SENT fails (fencing lost / crash), a later retry may send again. There is no provider
 * idempotency key for this transport. Do not claim exactly-once.
 */

const retryDelayMs = (attempt: number): number =>
  env.DAILY_ATTENDANCE_REPORT_RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1);

const leaseSeconds = (): number => {
  const base = Math.ceil(env.DAILY_ATTENDANCE_REPORT_LEASE_MS / 1000);
  const smtpFloor = Math.ceil(env.DAILY_ATTENDANCE_REPORT_SMTP_TIMEOUT_MS / 1000) + 30;
  return Math.max(base, smtpFloor);
};

type EnabledCompanyRow = {
  company_id: string;
  company_name: string;
  operation_timezone: string | null;
  daily_attendance_report_time: unknown;
  early_leave_tolerance_minutes: number;
};

const listEnabledCompanies = async (): Promise<EnabledCompanyRow[]> => {
  const result = await getPool().request().query(`
    SELECT
      cs.company_id,
      c.name AS company_name,
      cs.operation_timezone,
      cs.daily_attendance_report_time,
      cs.early_leave_tolerance_minutes
    FROM company_settings cs
    INNER JOIN companies c ON c.id = cs.company_id
    WHERE cs.daily_attendance_report_enabled = 1
      AND c.status = N'ACTIVE'
  `);
  return result.recordset as EnabledCompanyRow[];
};

const loadCompanyContext = async (companyId: string) => {
  const settings = await companySettingsRepository.findByCompanyId(companyId);
  if (!settings) {
    throw Object.assign(new Error("COMPANY_SETTINGS_NOT_FOUND"), {
      code: "COMPANY_SETTINGS_NOT_FOUND",
    });
  }
  const company = await getPool()
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .query(`SELECT TOP 1 name, status FROM companies WHERE id = @companyId`);
  const row = company.recordset[0] as { name?: string; status?: string } | undefined;
  return {
    settings,
    companyName: String(row?.name ?? ""),
    companyStatus: String(row?.status ?? ""),
  };
};

type DeliveryBatchOutcome = "SENT" | "PARTIAL" | "FAILED" | "WAITING_BACKOFF";

const processDeliveriesFromSnapshot = async (input: {
  run: DailyAttendanceReportRun;
  leaseOwner: string;
}): Promise<DeliveryBatchOutcome> => {
  const email = input.run.emailSnapshot;
  if (!email || !input.run.xlsxSnapshot) {
    return "FAILED";
  }

  const maxAttempts = env.DAILY_ATTENDANCE_REPORT_MAX_ATTEMPTS;
  const leaseSec = leaseSeconds();

  await dailyAttendanceReportDeliveryRepository.recoverExpiredDeliveryLeases(
    input.run.companyId,
    input.run.id,
  );

  for (;;) {
    const delivery = await dailyAttendanceReportDeliveryRepository.claimNextForRun(
      input.run.companyId,
      input.run.id,
      input.leaseOwner,
      leaseSec,
      maxAttempts,
    );
    if (!delivery) {
      break;
    }

    logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_DELIVERY_CLAIMED", {
      companyId: input.run.companyId,
      runId: input.run.id,
      deliveryId: delivery.id,
      attempt: delivery.attemptCount,
    });

    const renewed = await dailyAttendanceReportDeliveryRepository.renewLease(
      input.run.companyId,
      delivery.id,
      input.leaseOwner,
      leaseSec,
    );
    if (!renewed) {
      logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_LEASE_FENCE_REJECTED", {
        companyId: input.run.companyId,
        runId: input.run.id,
        deliveryId: delivery.id,
        phase: "pre_send_renew",
      });
      continue;
    }

    try {
      const result = await sendEmail({
        to: delivery.emailSnapshot,
        subject: email.subject,
        text: email.text,
        html: email.html,
        attachments: [{ filename: `reporte-asistencia-${input.run.reportDate}.xlsx`, content: input.run.xlsxSnapshot, contentType: DAILY_XLSX_CONTENT_TYPE }],
      });

      if (!result.sent) {
        const code = result.publicErrorCode ?? "EMAIL_NOT_DELIVERED";
        const terminal =
          result.transport === "console" ||
          result.transport === "disabled" ||
          delivery.attemptCount >= maxAttempts;
        const nextAttemptAt = terminal
          ? null
          : new Date(Date.now() + retryDelayMs(delivery.attemptCount));
        const marked = await dailyAttendanceReportDeliveryRepository.markFailed({
          companyId: input.run.companyId,
          deliveryId: delivery.id,
          leaseOwner: input.leaseOwner,
          error: { code, message: code },
          nextAttemptAt,
          terminal,
        });
        if (!marked) {
          logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_LEASE_FENCE_REJECTED", {
            companyId: input.run.companyId,
            runId: input.run.id,
            deliveryId: delivery.id,
            phase: "mark_failed",
          });
          continue;
        }
        logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_EMAIL_FAILED", {
          companyId: input.run.companyId,
          runId: input.run.id,
          deliveryId: delivery.id,
          attempt: delivery.attemptCount,
          errorCode: code,
        });
        if (terminal) {
          logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_DELIVERY_TERMINAL", {
            companyId: input.run.companyId,
            runId: input.run.id,
            deliveryId: delivery.id,
            errorCode: code,
          });
        } else if (nextAttemptAt) {
          logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_RETRY_SCHEDULED", {
            companyId: input.run.companyId,
            runId: input.run.id,
            deliveryId: delivery.id,
            nextAttemptAt: nextAttemptAt.toISOString(),
          });
        }
        continue;
      }

      const markedSent = await dailyAttendanceReportDeliveryRepository.markSent({
        companyId: input.run.companyId,
        deliveryId: delivery.id,
        leaseOwner: input.leaseOwner,
        providerMessageId: result.messageId,
      });
      if (!markedSent) {
        // Ambiguous: provider may have accepted; fencing lost. At-least-once.
        logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_LEASE_FENCE_REJECTED", {
          companyId: input.run.companyId,
          runId: input.run.id,
          deliveryId: delivery.id,
          phase: "mark_sent_after_provider_accept",
        });
        continue;
      }
      logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_EMAIL_SENT", {
        companyId: input.run.companyId,
        runId: input.run.id,
        deliveryId: delivery.id,
        attempt: delivery.attemptCount,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "EMAIL_SEND_FAILED";
      const terminal = delivery.attemptCount >= maxAttempts;
      const nextAttemptAt = terminal
        ? null
        : new Date(Date.now() + retryDelayMs(delivery.attemptCount));
      const marked = await dailyAttendanceReportDeliveryRepository.markFailed({
        companyId: input.run.companyId,
        deliveryId: delivery.id,
        leaseOwner: input.leaseOwner,
        error: { code: "EMAIL_SEND_FAILED", message: message.slice(0, 1000) },
        nextAttemptAt,
        terminal,
      });
      if (!marked) {
        logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_LEASE_FENCE_REJECTED", {
          companyId: input.run.companyId,
          runId: input.run.id,
          deliveryId: delivery.id,
          phase: "mark_failed_exception",
        });
        continue;
      }
      logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_EMAIL_FAILED", {
        companyId: input.run.companyId,
        runId: input.run.id,
        deliveryId: delivery.id,
        attempt: delivery.attemptCount,
        errorCode: "EMAIL_SEND_FAILED",
      });
      if (terminal) {
        logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_DELIVERY_TERMINAL", {
          companyId: input.run.companyId,
          runId: input.run.id,
          deliveryId: delivery.id,
          errorCode: "EMAIL_SEND_FAILED",
        });
      } else if (nextAttemptAt) {
        logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_RETRY_SCHEDULED", {
          companyId: input.run.companyId,
          runId: input.run.id,
          deliveryId: delivery.id,
          nextAttemptAt: nextAttemptAt.toISOString(),
        });
      }
    }
  }

  const summary = await dailyAttendanceReportDeliveryRepository.summarizeForRun(
    input.run.companyId,
    input.run.id,
  );
  if (summary.total === 0) {
    return "FAILED";
  }
  if (summary.pending > 0 || summary.failedRetryable > 0) {
    if (summary.sent === 0 && summary.failedRetryable === 0 && summary.pending === 0) {
      return "FAILED";
    }
    // Still work remaining (pending now or retryable later)
    const eligibleNow =
      summary.pending > 0 ||
      (summary.minRetryAt != null && summary.minRetryAt.getTime() <= Date.now());
    if (!eligibleNow && summary.failedRetryable > 0) {
      return "WAITING_BACKOFF";
    }
    if (summary.sent > 0) {
      return "PARTIAL";
    }
    return summary.failedTerminal > 0 && summary.failedRetryable === 0 && summary.pending === 0
      ? "FAILED"
      : "PARTIAL";
  }
  if (summary.sent === summary.total) {
    return "SENT";
  }
  if (summary.sent > 0) {
    return "PARTIAL";
  }
  return "FAILED";
};

const finalizeFromOutcome = async (input: {
  run: DailyAttendanceReportRun;
  leaseOwner: string;
  outcome: DeliveryBatchOutcome;
}): Promise<void> => {
  const summary = await dailyAttendanceReportDeliveryRepository.summarizeForRun(
    input.run.companyId,
    input.run.id,
  );
  const nextAttemptAt = summary.minRetryAt;

  if (input.outcome === "SENT") {
    const ok = await dailyAttendanceReportRunRepository.finalizeStatus({
      runId: input.run.id,
      companyId: input.run.companyId,
      leaseOwner: input.leaseOwner,
      status: "SENT",
    });
    if (!ok) {
      logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_LEASE_FENCE_REJECTED", {
        companyId: input.run.companyId,
        runId: input.run.id,
        phase: "finalize_sent",
      });
      return;
    }
    logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_RUN_SENT", {
      companyId: input.run.companyId,
      reportDate: input.run.reportDate,
      runId: input.run.id,
    });
    return;
  }

  if (input.outcome === "WAITING_BACKOFF" || input.outcome === "PARTIAL") {
    const ok = await dailyAttendanceReportRunRepository.finalizeStatus({
      runId: input.run.id,
      companyId: input.run.companyId,
      leaseOwner: input.leaseOwner,
      status: "PARTIAL",
      error: { code: "PARTIAL_DELIVERY", message: "Quedan entregas pendientes o fallidas" },
      nextAttemptAt,
    });
    if (!ok) {
      logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_LEASE_FENCE_REJECTED", {
        companyId: input.run.companyId,
        runId: input.run.id,
        phase: "finalize_partial",
      });
      return;
    }
    logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_RUN_PARTIAL", {
      companyId: input.run.companyId,
      reportDate: input.run.reportDate,
      runId: input.run.id,
      nextAttemptAt: nextAttemptAt?.toISOString() ?? null,
      failedRetryable: summary.failedRetryable,
      failedTerminal: summary.failedTerminal,
      sent: summary.sent,
    });
    return;
  }

  const ok = await dailyAttendanceReportRunRepository.finalizeStatus({
    runId: input.run.id,
    companyId: input.run.companyId,
    leaseOwner: input.leaseOwner,
    status: "FAILED",
    error: { code: "ALL_DELIVERIES_FAILED", message: "No se completó ninguna entrega" },
    nextAttemptAt: null,
  });
  if (!ok) {
    logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_LEASE_FENCE_REJECTED", {
      companyId: input.run.companyId,
      runId: input.run.id,
      phase: "finalize_failed",
    });
    return;
  }
  logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_RUN_FAILED", {
    companyId: input.run.companyId,
    reportDate: input.run.reportDate,
    runId: input.run.id,
  });
};

const generateSnapshotIfNeeded = async (input: {
  run: DailyAttendanceReportRun;
  companyName: string;
  earlyLeaveToleranceMinutes: number;
  leaseOwner: string;
}): Promise<"SKIPPED_NO_RECIPIENTS" | "SKIPPED_NO_ACTIVITY" | "READY" | "FENCE_LOST"> => {
  if (input.run.generatedAt && input.run.emailSnapshot && input.run.xlsxSnapshot) {
    return "READY";
  }

  const recipients =
    await companyAlertRecipientRepository.listEnabledWithUserEmailForDailyReport(
      input.run.companyId,
    );
  if (recipients.length === 0) {
    const ok = await dailyAttendanceReportRunRepository.markSkipped(
      input.run.id,
      input.run.companyId,
      input.leaseOwner,
      "SKIPPED_NO_RECIPIENTS",
    );
    if (!ok) {
      return "FENCE_LOST";
    }
    logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_NO_RECIPIENTS", {
      companyId: input.run.companyId,
      reportDate: input.run.reportDate,
      runId: input.run.id,
      reason: "no_enabled_alert_recipients_with_user_email",
    });
    return "SKIPPED_NO_RECIPIENTS";
  }

  const evaluatedAt = new Date();
  const payload = await dailyAttendanceReportAggregator.buildReport({
    companyId: input.run.companyId,
    reportDate: input.run.reportDate,
    timezoneId: input.run.timezoneId,
    earlyLeaveToleranceMinutes: input.earlyLeaveToleranceMinutes,
    evaluatedAt,
  });
  payload.companyName = payload.companyName || input.companyName;

  if (!payload.hasActivity) {
    const ok = await dailyAttendanceReportRunRepository.markSkipped(
      input.run.id,
      input.run.companyId,
      input.leaseOwner,
      "SKIPPED_NO_ACTIVITY",
    );
    if (!ok) {
      return "FENCE_LOST";
    }
    logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_NO_ACTIVITY", {
      companyId: input.run.companyId,
      reportDate: input.run.reportDate,
      runId: input.run.id,
    });
    return "SKIPPED_NO_ACTIVITY";
  }

  const email = buildDailyAttendanceReportEmail(payload);
  const xlsx = buildDailyAttendanceReportXlsx(payload);
  const persisted = await dailyAttendanceReportRunRepository.persistSnapshotAndAudience({
    runId: input.run.id,
    companyId: input.run.companyId,
    leaseOwner: input.leaseOwner,
    totals: payload.totals,
    recipientCount: recipients.length,
    totalIncidentCount: payload.totalIncidentCount,
    templateVersion: DAILY_ATTENDANCE_REPORT_TEMPLATE_VERSION,
    email,
    xlsx,
    evaluatedAt,
    recipients: recipients.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.displayName,
    })),
  });
  if (!persisted) {
    logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_LEASE_FENCE_REJECTED", {
      companyId: input.run.companyId,
      runId: input.run.id,
      phase: "persist_snapshot",
    });
    return "FENCE_LOST";
  }

  logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_SNAPSHOT_GENERATED", {
    companyId: input.run.companyId,
    reportDate: input.run.reportDate,
    runId: input.run.id,
    operationsCount: payload.totals.operationsCount,
    scheduledEmployeesCount: payload.totals.scheduledEmployeesCount,
    recipientCount: recipients.length,
    totalIncidentCount: payload.totalIncidentCount,
    incidentsTruncated:
      payload.totalIncidentCount > payload.incidents.length,
    templateVersion: DAILY_ATTENDANCE_REPORT_TEMPLATE_VERSION,
    evaluatedAt: evaluatedAt.toISOString(),
  });
  logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_GENERATED", {
    companyId: input.run.companyId,
    reportDate: input.run.reportDate,
    runId: input.run.id,
    operationsCount: payload.totals.operationsCount,
    scheduledEmployeesCount: payload.totals.scheduledEmployeesCount,
    recipientCount: recipients.length,
  });
  return "READY";
};

const processClaimedRun = async (input: {
  run: DailyAttendanceReportRun;
  leaseOwner: string;
}): Promise<void> => {
  const ctx = await loadCompanyContext(input.run.companyId);
  if (!ctx.settings.dailyAttendanceReportEnabled) {
    await dailyAttendanceReportRunRepository.finalizeStatus({
      runId: input.run.id,
      companyId: input.run.companyId,
      leaseOwner: input.leaseOwner,
      status: "FAILED",
      error: { code: "REPORT_DISABLED", message: "Reporte deshabilitado" },
    });
    return;
  }

  await dailyAttendanceReportRunRepository.renewLease(
    input.run.companyId,
    input.run.id,
    input.leaseOwner,
    leaseSeconds(),
  );

  const gen = await generateSnapshotIfNeeded({
    run: input.run,
    companyName: ctx.companyName,
    earlyLeaveToleranceMinutes: ctx.settings.earlyLeaveToleranceMinutes,
    leaseOwner: input.leaseOwner,
  });
  if (gen !== "READY") {
    return;
  }

  const refreshed = await dailyAttendanceReportRunRepository.findById(
    input.run.companyId,
    input.run.id,
  );
  if (!refreshed?.emailSnapshot || !refreshed.xlsxSnapshot) {
    return;
  }

  const outcome = await processDeliveriesFromSnapshot({
    run: refreshed,
    leaseOwner: input.leaseOwner,
  });
  await finalizeFromOutcome({
    run: refreshed,
    leaseOwner: input.leaseOwner,
    outcome,
  });
};

export const dailyAttendanceReportService = {
  async enqueueDueCompanies(nowUtc: Date = new Date()): Promise<{ enqueued: number }> {
    const companies = await listEnabledCompanies();
    let enqueued = 0;
    const { adminAlertCutoverService } = await import("./admin-alert-cutover.service");
    for (const company of companies) {
      await adminAlertCutoverService.tryAutoCutoverToDailyEmail({
        companyId: String(company.company_id),
        actorUserId: "system:daily-report-worker",
      });
      const timezoneId = resolveOperationTimezone(company.operation_timezone);
      const reportTimeLocal = normalizeReportTimeHHmm(
        company.daily_attendance_report_time
          ? String(company.daily_attendance_report_time)
          : null,
      );
      if (!hasLocalReportTimeArrived(nowUtc, timezoneId, reportTimeLocal)) {
        continue;
      }
      const dates = listCatchUpReportDates(
        nowUtc,
        timezoneId,
        DAILY_ATTENDANCE_REPORT_CATCHUP_MAX_DAYS,
      );
      const ordered = [
        resolveReportDateLocal(nowUtc, timezoneId).reportDate,
        ...dates.filter(
          (d) => d !== resolveReportDateLocal(nowUtc, timezoneId).reportDate,
        ),
      ];
      const uniqueDates = [...new Set(ordered)].slice(
        0,
        DAILY_ATTENDANCE_REPORT_CATCHUP_MAX_DAYS,
      );
      for (const reportDate of uniqueDates) {
        const { created } = await dailyAttendanceReportRunRepository.ensurePendingRun({
          companyId: String(company.company_id),
          reportDate,
          timezoneId,
          reportTimeLocal,
        });
        if (created) {
          enqueued += 1;
          logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_RUN_CREATED", {
            companyId: String(company.company_id),
            reportDate,
          });
        }
      }
    }
    return { enqueued };
  },

  async processNextBatch(nowUtc: Date = new Date()): Promise<{
    recovered: number;
    processed: number;
  }> {
    const schema = await assertDailyReportAudienceSchemaReady();
    if (!schema.ok) {
      logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_SCHEMA_BLOCKED", {
        reason: schema.reason,
        fkName: schema.fkName,
        referencedTable: schema.referencedTable,
      });
      return { recovered: 0, processed: 0 };
    }
    const owner = `daily-report:${randomUUID()}`;
    const recovered = await dailyAttendanceReportRunRepository.recoverExpiredLeases(
      env.DAILY_ATTENDANCE_REPORT_BATCH_SIZE,
    );
    if (recovered > 0) {
      logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_LEASE_RECOVERED", {
        recovered,
      });
    }

    await this.enqueueDueCompanies(nowUtc);

    let processed = 0;
    for (let i = 0; i < env.DAILY_ATTENDANCE_REPORT_BATCH_SIZE; i += 1) {
      const run = await dailyAttendanceReportRunRepository.claimNextRun(
        owner,
        leaseSeconds(),
        env.DAILY_ATTENDANCE_REPORT_MAX_ATTEMPTS,
      );
      if (!run) {
        break;
      }
      logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_RUN_CLAIMED", {
        companyId: run.companyId,
        reportDate: run.reportDate,
        runId: run.id,
        attempt: run.attemptCount,
      });
      const started = Date.now();
      try {
        await processClaimedRun({ run, leaseOwner: owner });
        processed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "RUN_FAILED";
        await dailyAttendanceReportRunRepository.finalizeStatus({
          runId: run.id,
          companyId: run.companyId,
          leaseOwner: owner,
          status: "FAILED",
          error: { code: "RUN_FAILED", message: message.slice(0, 1000) },
          nextAttemptAt: new Date(Date.now() + retryDelayMs(run.attemptCount)),
        });
        logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_RUN_FAILED", {
          companyId: run.companyId,
          reportDate: run.reportDate,
          runId: run.id,
          errorCode: "RUN_FAILED",
          durationMs: Date.now() - started,
        });
      }
    }
    return { recovered, processed };
  },

  async triggerManual(input: {
    companyId: string;
    reportDate: string;
    actorUserId: string;
    reason?: string;
  }): Promise<{
    runId: string;
    status: string;
    action: "processed" | "already_sent" | "reopened" | "regenerated" | "retry_failed_only";
  }> {
    const schema = await assertDailyReportAudienceSchemaReady();
    if (!schema.ok) {
      throw Object.assign(new Error("SCHEMA_INCOMPATIBLE"), {
        code: "SCHEMA_INCOMPATIBLE",
        message:
          "El esquema de destinatarios del reporte no está migrado. Aplicá la migración 136 antes de generar reportes.",
      });
    }
    const ctx = await loadCompanyContext(input.companyId);
    const timezoneId = resolveOperationTimezone(ctx.settings.operationTimezone);
    const reportTimeLocal = normalizeReportTimeHHmm(ctx.settings.dailyAttendanceReportTime);

    const dateCheck = validateManualReportDate({
      reportDateRaw: input.reportDate,
      timezoneId,
    });
    if (!dateCheck.ok) {
      throw Object.assign(new Error(dateCheck.code), {
        code: dateCheck.code,
        message: dateCheck.message,
      });
    }

    logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_MANUAL_TRIGGERED", {
      companyId: input.companyId,
      reportDate: dateCheck.reportDate,
      actorUserId: input.actorUserId,
      reason: input.reason ?? null,
    });

    const leaseOwner = `manual:${input.actorUserId}:${randomUUID()}`;
    const { run, created } = await dailyAttendanceReportRunRepository.ensurePendingRun({
      companyId: input.companyId,
      reportDate: dateCheck.reportDate,
      timezoneId,
      reportTimeLocal,
    });
    let currentRun = run;
    if (created) {
      logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_RUN_CREATED", {
        companyId: input.companyId,
        reportDate: dateCheck.reportDate,
        runId: currentRun.id,
      });
    }

    let action:
      | "processed"
      | "already_sent"
      | "reopened"
      | "regenerated"
      | "retry_failed_only" = "processed";

    if (currentRun.status === "SENT") {
      return { runId: currentRun.id, status: currentRun.status, action: "already_sent" };
    }

    if (currentRun.status === "SKIPPED_NO_RECIPIENTS") {
      const recipients =
        await companyAlertRecipientRepository.listEnabledWithUserEmailForDailyReport(
          input.companyId,
        );
      if (recipients.length === 0) {
        return { runId: currentRun.id, status: currentRun.status, action: "processed" };
      }
      await dailyAttendanceReportRunRepository.reopenForManual({
        companyId: input.companyId,
        runId: currentRun.id,
        clearSnapshot: true,
      });
      await dailyAttendanceReportRunRepository.deleteDeliveriesForRegeneration(
        input.companyId,
        currentRun.id,
      );
      logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_MANUAL_REOPENED", {
        companyId: input.companyId,
        runId: currentRun.id,
        fromStatus: "SKIPPED_NO_RECIPIENTS",
        actorUserId: input.actorUserId,
      });
      action = "reopened";
      currentRun = (await dailyAttendanceReportRunRepository.findById(
        input.companyId,
        currentRun.id,
      ))!;
    } else if (currentRun.status === "SKIPPED_NO_ACTIVITY") {
      await dailyAttendanceReportRunRepository.reopenForManual({
        companyId: input.companyId,
        runId: currentRun.id,
        clearSnapshot: true,
      });
      await dailyAttendanceReportRunRepository.deleteDeliveriesForRegeneration(
        input.companyId,
        currentRun.id,
      );
      logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_MANUAL_REGENERATED", {
        companyId: input.companyId,
        runId: currentRun.id,
        fromStatus: "SKIPPED_NO_ACTIVITY",
        actorUserId: input.actorUserId,
      });
      action = "regenerated";
      currentRun = (await dailyAttendanceReportRunRepository.findById(
        input.companyId,
        currentRun.id,
      ))!;
    } else if (
      (currentRun.status === "PARTIAL" || currentRun.status === "FAILED") &&
      currentRun.generatedAt &&
      currentRun.emailSnapshot
    ) {
      action = "retry_failed_only";
    }

    const claimed = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, currentRun.id)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("leaseOwner", sql.NVarChar(100), leaseOwner)
      .input("leaseSeconds", sql.Int, leaseSeconds())
      .query(`
        UPDATE company_daily_attendance_report_runs
        SET status = N'PROCESSING',
            attempt_count = attempt_count + 1,
            lease_owner = @leaseOwner,
            lease_expires_at = DATEADD(SECOND, @leaseSeconds, SYSUTCDATETIME()),
            started_at = COALESCE(started_at, SYSUTCDATETIME()),
            finished_at = NULL,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @id
          AND company_id = @companyId
          AND status IN (N'PENDING', N'PARTIAL', N'FAILED')
          AND (lease_expires_at IS NULL OR lease_expires_at < SYSUTCDATETIME())
      `);
    const claimedRow = claimed.recordset[0] as Record<string, unknown> | undefined;
    if (!claimedRow) {
      const latest = await dailyAttendanceReportRunRepository.findById(
        input.companyId,
        currentRun.id,
      );
      return {
        runId: currentRun.id,
        status: latest?.status ?? currentRun.status,
        action,
      };
    }

    const claimedRun = (await dailyAttendanceReportRunRepository.findById(
      input.companyId,
      currentRun.id,
    ))!;
    await processClaimedRun({ run: claimedRun, leaseOwner });
    const finalRun = await dailyAttendanceReportRunRepository.findById(
      input.companyId,
      currentRun.id,
    );
    return {
      runId: currentRun.id,
      status: finalRun?.status ?? "UNKNOWN",
      action,
    };
  },
};
