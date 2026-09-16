import { randomUUID } from "node:crypto";
import sql from "mssql";
import { env } from "../config/env";
import {
  DAILY_ATTENDANCE_REPORT_CATCHUP_MAX_DAYS,
} from "../constants/daily-attendance-report";
import { getPool } from "../database/connection";
import { companyReportEmailRecipientRepository } from "../repositories/company-report-email-recipient.repository";
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
import { logDailyAttendanceReportEvent } from "../utils/daily-attendance-report-observability";
import type { DailyAttendanceReportPayload } from "../types/daily-attendance-report";

const retryDelayMs = (attempt: number): number =>
  env.DAILY_ATTENDANCE_REPORT_RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1);

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

const processDeliveriesForRun = async (input: {
  companyId: string;
  runId: string;
  payload: DailyAttendanceReportPayload;
  leaseOwner: string;
}): Promise<"SENT" | "PARTIAL" | "FAILED" | "PENDING"> => {
  const emailContent = buildDailyAttendanceReportEmail(input.payload);
  const maxAttempts = env.DAILY_ATTENDANCE_REPORT_MAX_ATTEMPTS;
  const leaseSeconds = Math.ceil(env.DAILY_ATTENDANCE_REPORT_LEASE_MS / 1000);

  for (;;) {
    const delivery = await dailyAttendanceReportDeliveryRepository.claimNextForRun(
      input.companyId,
      input.runId,
      input.leaseOwner,
      leaseSeconds,
      maxAttempts,
    );
    if (!delivery) {
      break;
    }
    logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_DELIVERY_CLAIMED", {
      companyId: input.companyId,
      runId: input.runId,
      deliveryId: delivery.id,
      attempt: delivery.attemptCount,
    });

    try {
      const result = await sendEmail({
        to: delivery.emailSnapshot,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
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
        await dailyAttendanceReportDeliveryRepository.markFailed(
          input.companyId,
          delivery.id,
          { code, message: code },
          nextAttemptAt,
          terminal,
        );
        logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_EMAIL_FAILED", {
          companyId: input.companyId,
          runId: input.runId,
          deliveryId: delivery.id,
          attempt: delivery.attemptCount,
          errorCode: code,
        });
        if (!terminal && nextAttemptAt) {
          logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_RETRY_SCHEDULED", {
            companyId: input.companyId,
            runId: input.runId,
            deliveryId: delivery.id,
            nextAttemptAt: nextAttemptAt.toISOString(),
          });
        }
        continue;
      }

      await dailyAttendanceReportDeliveryRepository.markSent(
        input.companyId,
        delivery.id,
        result.messageId,
      );
      logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_EMAIL_SENT", {
        companyId: input.companyId,
        runId: input.runId,
        deliveryId: delivery.id,
        attempt: delivery.attemptCount,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "EMAIL_SEND_FAILED";
      const terminal = delivery.attemptCount >= maxAttempts;
      const nextAttemptAt = terminal
        ? null
        : new Date(Date.now() + retryDelayMs(delivery.attemptCount));
      await dailyAttendanceReportDeliveryRepository.markFailed(
        input.companyId,
        delivery.id,
        { code: "EMAIL_SEND_FAILED", message: message.slice(0, 1000) },
        nextAttemptAt,
        terminal,
      );
      logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_EMAIL_FAILED", {
        companyId: input.companyId,
        runId: input.runId,
        deliveryId: delivery.id,
        attempt: delivery.attemptCount,
        errorCode: "EMAIL_SEND_FAILED",
      });
    }
  }

  const summary = await dailyAttendanceReportDeliveryRepository.summarizeForRun(
    input.companyId,
    input.runId,
  );
  if (summary.total === 0) {
    return "FAILED";
  }
  if (summary.pending > 0) {
    return "PENDING";
  }
  if (summary.sent === summary.total) {
    return "SENT";
  }
  if (summary.sent > 0 && summary.failed > 0) {
    return "PARTIAL";
  }
  return "FAILED";
};

const processCompanyReportDate = async (input: {
  companyId: string;
  companyName: string;
  reportDate: string;
  timezoneId: string;
  reportTimeLocal: string;
  earlyLeaveToleranceMinutes: number;
  leaseOwner: string;
  forceFailedRetriesOnly?: boolean;
}): Promise<void> => {
  const ensured = await dailyAttendanceReportRunRepository.ensurePendingRun({
    companyId: input.companyId,
    reportDate: input.reportDate,
    timezoneId: input.timezoneId,
    reportTimeLocal: input.reportTimeLocal,
  });
  if (ensured.created) {
    logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_RUN_CREATED", {
      companyId: input.companyId,
      reportDate: input.reportDate,
      runId: ensured.run.id,
    });
  } else {
    logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_DUPLICATE_AVOIDED", {
      companyId: input.companyId,
      reportDate: input.reportDate,
      runId: ensured.run.id,
      status: ensured.run.status,
    });
  }

  if (
    ensured.run.status === "SENT" ||
    ensured.run.status === "SKIPPED_NO_ACTIVITY" ||
    ensured.run.status === "SKIPPED_NO_RECIPIENTS"
  ) {
    return;
  }

  const recipients = await companyReportEmailRecipientRepository.listEnabled(input.companyId);
  if (recipients.length === 0) {
    await dailyAttendanceReportRunRepository.markSkipped(
      ensured.run.id,
      input.companyId,
      "SKIPPED_NO_RECIPIENTS",
    );
    logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_NO_RECIPIENTS", {
      companyId: input.companyId,
      reportDate: input.reportDate,
      runId: ensured.run.id,
    });
    return;
  }

  const payload = await dailyAttendanceReportAggregator.buildReport({
    companyId: input.companyId,
    reportDate: input.reportDate,
    timezoneId: input.timezoneId,
    earlyLeaveToleranceMinutes: input.earlyLeaveToleranceMinutes,
  });
  payload.companyName = payload.companyName || input.companyName;

  if (!payload.hasActivity) {
    await dailyAttendanceReportRunRepository.markSkipped(
      ensured.run.id,
      input.companyId,
      "SKIPPED_NO_ACTIVITY",
    );
    logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_NO_ACTIVITY", {
      companyId: input.companyId,
      reportDate: input.reportDate,
      runId: ensured.run.id,
    });
    return;
  }

  await dailyAttendanceReportRunRepository.updateTotals(
    ensured.run.id,
    input.companyId,
    payload.totals,
    recipients.length,
  );
  logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_GENERATED", {
    companyId: input.companyId,
    reportDate: input.reportDate,
    runId: ensured.run.id,
    operationsCount: payload.totals.operationsCount,
    scheduledEmployeesCount: payload.totals.scheduledEmployeesCount,
    recipientCount: recipients.length,
  });

  await dailyAttendanceReportDeliveryRepository.ensureDeliveries(
    input.companyId,
    ensured.run.id,
    recipients.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.displayName,
    })),
  );

  const outcome = await processDeliveriesForRun({
    companyId: input.companyId,
    runId: ensured.run.id,
    payload,
    leaseOwner: input.leaseOwner,
  });

  if (outcome === "SENT") {
    await dailyAttendanceReportRunRepository.finalizeStatus(
      ensured.run.id,
      input.companyId,
      "SENT",
    );
    logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_RUN_SENT", {
      companyId: input.companyId,
      reportDate: input.reportDate,
      runId: ensured.run.id,
    });
    return;
  }
  if (outcome === "PARTIAL") {
    await dailyAttendanceReportRunRepository.finalizeStatus(
      ensured.run.id,
      input.companyId,
      "PARTIAL",
      { code: "PARTIAL_DELIVERY", message: "Algunas entregas fallaron" },
      new Date(Date.now() + retryDelayMs(ensured.run.attemptCount + 1)),
    );
    logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_RUN_PARTIAL", {
      companyId: input.companyId,
      reportDate: input.reportDate,
      runId: ensured.run.id,
    });
    return;
  }
  if (outcome === "PENDING") {
    await dailyAttendanceReportRunRepository.finalizeStatus(
      ensured.run.id,
      input.companyId,
      "PARTIAL",
      { code: "DELIVERIES_PENDING", message: "Quedan entregas pendientes de reintento" },
      new Date(Date.now() + retryDelayMs(ensured.run.attemptCount + 1)),
    );
    return;
  }

  await dailyAttendanceReportRunRepository.finalizeStatus(
    ensured.run.id,
    input.companyId,
    "FAILED",
    { code: "ALL_DELIVERIES_FAILED", message: "No se completó ninguna entrega" },
    new Date(Date.now() + retryDelayMs(ensured.run.attemptCount + 1)),
  );
  logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_RUN_FAILED", {
    companyId: input.companyId,
    reportDate: input.reportDate,
    runId: ensured.run.id,
  });
};

export const dailyAttendanceReportService = {
  async enqueueDueCompanies(nowUtc: Date = new Date()): Promise<{ enqueued: number }> {
    const companies = await listEnabledCompanies();
    let enqueued = 0;
    for (const company of companies) {
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
      // Prefer yesterday first, then older catch-up.
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
    const leaseOwner = `daily-report:${randomUUID()}`;
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
    const leaseSeconds = Math.ceil(env.DAILY_ATTENDANCE_REPORT_LEASE_MS / 1000);
    for (let i = 0; i < env.DAILY_ATTENDANCE_REPORT_BATCH_SIZE; i += 1) {
      const run = await dailyAttendanceReportRunRepository.claimNextRun(
        leaseOwner,
        leaseSeconds,
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
        const ctx = await loadCompanyContext(run.companyId);
        if (!ctx.settings.dailyAttendanceReportEnabled) {
          await dailyAttendanceReportRunRepository.finalizeStatus(
            run.id,
            run.companyId,
            "FAILED",
            { code: "REPORT_DISABLED", message: "Reporte deshabilitado" },
          );
          continue;
        }
        await processCompanyReportDate({
          companyId: run.companyId,
          companyName: ctx.companyName,
          reportDate: run.reportDate,
          timezoneId: run.timezoneId,
          reportTimeLocal: run.reportTimeLocal,
          earlyLeaveToleranceMinutes: ctx.settings.earlyLeaveToleranceMinutes,
          leaseOwner,
        });
        processed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "RUN_FAILED";
        await dailyAttendanceReportRunRepository.finalizeStatus(
          run.id,
          run.companyId,
          "FAILED",
          { code: "RUN_FAILED", message: message.slice(0, 1000) },
          new Date(Date.now() + retryDelayMs(run.attemptCount)),
        );
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
  }): Promise<{ runId: string }> {
    const ctx = await loadCompanyContext(input.companyId);
    const timezoneId = resolveOperationTimezone(ctx.settings.operationTimezone);
    const reportTimeLocal = normalizeReportTimeHHmm(ctx.settings.dailyAttendanceReportTime);
    logDailyAttendanceReportEvent("DAILY_ATTENDANCE_REPORT_MANUAL_TRIGGERED", {
      companyId: input.companyId,
      reportDate: input.reportDate,
      actorUserId: input.actorUserId,
    });
    const leaseOwner = `manual:${input.actorUserId}:${randomUUID()}`;
    await processCompanyReportDate({
      companyId: input.companyId,
      companyName: ctx.companyName,
      reportDate: input.reportDate,
      timezoneId,
      reportTimeLocal,
      earlyLeaveToleranceMinutes: ctx.settings.earlyLeaveToleranceMinutes,
      leaseOwner,
      forceFailedRetriesOnly: true,
    });
    const run = await dailyAttendanceReportRunRepository.findByCompanyAndDate(
      input.companyId,
      input.reportDate,
    );
    if (!run) {
      throw Object.assign(new Error("REPORT_RUN_NOT_FOUND"), { code: "REPORT_RUN_NOT_FOUND" });
    }
    return { runId: run.id };
  },
};
