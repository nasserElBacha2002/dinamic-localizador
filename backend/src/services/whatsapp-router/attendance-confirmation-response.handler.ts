import { resolveOperationIdFromSessionContext } from "../../utils/legacy-operation-session-context";
import { botSessionService } from "../bot-session.service";
import { employeeWorkdayService } from "../employee-workday.service";
import {
  formatAssignmentDateTimeLine,
  formatAssignmentServiceReference,
} from "../../utils/employee-assignment-format";
import { companyOperationalSettingsService } from "../company-operational-settings.service";
import {
  parseAttendanceConfirmationReply,
  type AttendanceConfirmationReplyIntent,
} from "../../utils/attendance-confirmation-reply";
import { isAttendanceConfirmationResponseSessionState } from "../../utils/bot-session-states";
import { CONFIRMATION_EXPIRED_USER_MESSAGE } from "../../utils/attendance-confirmation-validity";
import { WHATSAPP_RESULT_CODES } from "../../constants/whatsapp-observability";
import { attendanceNotificationRepository } from "../../repositories/attendance-notification.repository";
import { getBotNow } from "../../utils/bot-runtime-context";
import type { WhatsAppRouterContext, WhatsAppRouterHandlers } from "./whatsapp-router.types";
import type { BotSession } from "../../types/twilio.types";

const AMBIGUOUS_REPLY_MESSAGE = [
  "No pude interpretar tu respuesta.",
  "",
  "Respondé:",
  "1 - Confirmar asistencia",
  "2 - No puedo asistir",
].join("\n");

const NOT_ASSIGNED_MESSAGE =
  "Ya no estás asignado a esa jornada. Si necesitás ayuda, contactá a administración.";

const resolveCompanyTimezone = async (companyId: string): Promise<string> => {
  const settings = await companyOperationalSettingsService.getCompanyOperationalSettings(companyId);
  return settings.operationTimezone;
};

const respond = (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
  message: string,
  extras?: { resultCode?: string; flowType?: string },
): Promise<string> =>
  handlers.respond(ctx.companyId, {
    message,
    employeeId: ctx.employeeId,
    phoneFrom: ctx.phoneTo,
    phoneTo: ctx.phoneFrom,
    resultCode: extras?.resultCode,
    flowType: extras?.flowType ?? "ATTENDANCE_CONFIRMATION_RESPONSE",
  });

const buildConfirmedReply = async (
  companyId: string,
  employeeId: string,
  operationId: string,
  fallbackMessage: string,
): Promise<string> => {
  const assignment = await employeeWorkdayService.getAssignmentForResponseMessage(
    companyId,
    employeeId,
    operationId,
  );
  if (!assignment) {
    return fallbackMessage;
  }
  const timeZone = await resolveCompanyTimezone(companyId);
  return [
    "✅ Participación confirmada.",
    "",
    `Te esperamos en ${formatAssignmentServiceReference(assignment)} el ${formatAssignmentDateTimeLine(assignment, timeZone)}.`,
    "",
    "Cuando llegues, compartí tu ubicación para registrar la asistencia.",
  ].join("\n");
};

const buildUnavailableReply = async (
  companyId: string,
  employeeId: string,
  operationId: string,
  fallbackMessage: string,
): Promise<string> => {
  const assignment = await employeeWorkdayService.getAssignmentForResponseMessage(
    companyId,
    employeeId,
    operationId,
  );
  if (!assignment) {
    return fallbackMessage;
  }
  const timeZone = await resolveCompanyTimezone(companyId);
  return `Registramos que no vas a poder asistir al trabajo asignado en ${formatAssignmentServiceReference(assignment)} el ${formatAssignmentDateTimeLine(assignment, timeZone)}.`;
};

const applyConfirmationReply = async (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
  input: {
    operationId: string;
    replyIntent: Exclude<AttendanceConfirmationReplyIntent, "unknown">;
    sessionId?: string;
    scheduledStart?: string | null;
    notificationId?: string | null;
    assignmentId?: string | null;
    scheduleVersion?: number | null;
  },
): Promise<string> => {
  const now = getBotNow();
  console.info("[whatsapp-bot] attendance confirmation response received", {
    event: "ATTENDANCE_CONFIRMATION_RESPONSE_RECEIVED",
    messageSid: ctx.payload.MessageSid,
    companyId: ctx.companyId,
    employeeId: ctx.employeeId,
    operationId: input.operationId,
    assignmentId: input.assignmentId ?? null,
    notificationId: input.notificationId ?? null,
    scheduleVersion: input.scheduleVersion ?? null,
    scheduledStart: input.scheduledStart ?? null,
    receivedAt: now.toISOString(),
    replyIntent: input.replyIntent,
  });

  if (!ctx.employeeId) {
    return respond(ctx, handlers, AMBIGUOUS_REPLY_MESSAGE);
  }

  if (input.replyIntent === "affirmative") {
    const result = await employeeWorkdayService.confirmAssignment(
      ctx.companyId,
      ctx.employeeId,
      input.operationId,
    );

    if (input.sessionId) {
      await botSessionService.completeSession(ctx.companyId, input.sessionId);
    }

    if (result.kind === "not_found") {
      return respond(ctx, handlers, NOT_ASSIGNED_MESSAGE);
    }

    if (result.kind === "past") {
      console.info("[whatsapp-bot] attendance confirmation expired", {
        event: "ATTENDANCE_CONFIRMATION_RESPONSE_RESULT",
        result: "CONFIRMATION_EXPIRED",
        employeeId: ctx.employeeId,
        operationId: input.operationId,
        assignmentId: input.assignmentId ?? null,
        scheduleVersion: input.scheduleVersion ?? null,
        scheduledStart: input.scheduledStart ?? null,
      });
      return respond(ctx, handlers, CONFIRMATION_EXPIRED_USER_MESSAGE, {
        resultCode: WHATSAPP_RESULT_CODES.CONFIRMATION_EXPIRED,
      });
    }

    console.info("[whatsapp-bot] attendance confirmation confirmed", {
      event: "ATTENDANCE_CONFIRMATION_RESPONSE_RESULT",
      result: "CONFIRMED",
      employeeId: ctx.employeeId,
      operationId: input.operationId,
      assignmentId: input.assignmentId ?? null,
      scheduleVersion: input.scheduleVersion ?? null,
      scheduledStart: input.scheduledStart ?? null,
    });

    const message = await buildConfirmedReply(
      ctx.companyId,
      ctx.employeeId,
      input.operationId,
      result.message,
    );
    return respond(ctx, handlers, message, {
      resultCode: WHATSAPP_RESULT_CODES.ATTENDANCE_CONFIRMATION_CONFIRMED,
    });
  }

  const result = await employeeWorkdayService.markAssignmentUnavailable(
    ctx.companyId,
    ctx.employeeId,
    input.operationId,
  );

  if (input.sessionId) {
    await botSessionService.completeSession(ctx.companyId, input.sessionId);
  }

  if (result.kind === "not_found") {
    return respond(ctx, handlers, NOT_ASSIGNED_MESSAGE);
  }

  if (result.kind === "past") {
    console.info("[whatsapp-bot] attendance confirmation expired", {
      event: "ATTENDANCE_CONFIRMATION_RESPONSE_RESULT",
      result: "CONFIRMATION_EXPIRED",
      employeeId: ctx.employeeId,
      operationId: input.operationId,
      assignmentId: input.assignmentId ?? null,
      scheduleVersion: input.scheduleVersion ?? null,
      scheduledStart: input.scheduledStart ?? null,
    });
    return respond(ctx, handlers, CONFIRMATION_EXPIRED_USER_MESSAGE, {
      resultCode: WHATSAPP_RESULT_CODES.CONFIRMATION_EXPIRED,
    });
  }

  console.info("[whatsapp-bot] attendance confirmation unavailable", {
    event: "ATTENDANCE_CONFIRMATION_RESPONSE_RESULT",
    result: "UNAVAILABLE",
    employeeId: ctx.employeeId,
    operationId: input.operationId,
    assignmentId: input.assignmentId ?? null,
    scheduleVersion: input.scheduleVersion ?? null,
    scheduledStart: input.scheduledStart ?? null,
  });

  const message = await buildUnavailableReply(
    ctx.companyId,
    ctx.employeeId,
    input.operationId,
    result.message,
  );
  return respond(ctx, handlers, message, {
    resultCode: WHATSAPP_RESULT_CODES.ATTENDANCE_CONFIRMATION_UNAVAILABLE,
  });
};

const sessionHadAttendanceConfirmationContext = (session: BotSession): boolean => {
  const context = botSessionService.parseContext(session.contextJson);
  return Boolean(context.attendanceConfirmation?.operationId || context.attendanceConfirmation?.notificationId);
};

export const handleActiveAttendanceConfirmationResponseSession = async (
  ctx: WhatsAppRouterContext,
  session: BotSession,
  handlers: WhatsAppRouterHandlers,
): Promise<string | null> => {
  if (!isAttendanceConfirmationResponseSessionState(session.state)) {
    return null;
  }

  const context = botSessionService.parseContext(session.contextJson);
  const operationId = resolveOperationIdFromSessionContext(context);
  if (!operationId || !ctx.employeeId) {
    await botSessionService.completeSession(ctx.companyId, session.id);
    return respond(ctx, handlers, AMBIGUOUS_REPLY_MESSAGE);
  }

  const replyIntent = parseAttendanceConfirmationReply(ctx.body ?? "");
  if (replyIntent === "unknown") {
    return respond(ctx, handlers, AMBIGUOUS_REPLY_MESSAGE);
  }

  return applyConfirmationReply(ctx, handlers, {
    operationId,
    replyIntent,
    sessionId: session.id,
    scheduledStart: context.attendanceConfirmation?.validUntil ?? null,
    notificationId: context.attendanceConfirmation?.notificationId ?? null,
    scheduleVersion: context.attendanceConfirmation?.scheduleVersion ?? null,
    assignmentId: null,
  });
};

/**
 * Durable confirmation reply when there is no active bot session.
 *
 * Open-window targets (now < scheduledStart, current scheduleVersion) may catch "1"/"2".
 * expired_pending is returned only when the latest session is an expired confirmation
 * context — historical PENDING alone never intercepts later numeric replies.
 */
export const handleDurableAttendanceConfirmationReply = async (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
): Promise<string | null> => {
  if (!ctx.employeeId || ctx.session) {
    return null;
  }

  const replyIntent = parseAttendanceConfirmationReply(ctx.body ?? "");
  if (replyIntent === "unknown") {
    return null;
  }

  const now = getBotNow();
  const openTarget = await attendanceNotificationRepository.findConfirmationReplyTarget(
    ctx.companyId,
    ctx.employeeId,
    now,
  );

  if (openTarget) {
    return applyConfirmationReply(ctx, handlers, {
      operationId: openTarget.operationId,
      replyIntent,
      scheduledStart: openTarget.scheduledStart,
      notificationId: openTarget.notificationId,
      assignmentId: openTarget.assignmentId,
      scheduleVersion: openTarget.scheduleVersion,
    });
  }

  if (!ctx.recentlyExpired) {
    return null;
  }

  const latest = await botSessionService.getLatestSessionByPhone(ctx.companyId, ctx.phoneFrom);
  if (!latest || latest.state !== "EXPIRED" || !sessionHadAttendanceConfirmationContext(latest)) {
    return null;
  }

  const expiredTarget = await attendanceNotificationRepository.findConfirmationReplyTarget(
    ctx.companyId,
    ctx.employeeId,
    now,
    { onlyExpired: true },
  );

  if (!expiredTarget || expiredTarget.kind !== "expired_pending") {
    return null;
  }

  console.info("[whatsapp-bot] attendance confirmation expired (durable+session context)", {
    event: "ATTENDANCE_CONFIRMATION_RESPONSE_RESULT",
    result: "CONFIRMATION_EXPIRED",
    messageSid: ctx.payload.MessageSid,
    employeeId: ctx.employeeId,
    operationId: expiredTarget.operationId,
    assignmentId: expiredTarget.assignmentId,
    scheduleVersion: expiredTarget.scheduleVersion,
    scheduledStart: expiredTarget.scheduledStart,
    receivedAt: now.toISOString(),
  });

  return respond(ctx, handlers, CONFIRMATION_EXPIRED_USER_MESSAGE, {
    resultCode: WHATSAPP_RESULT_CODES.CONFIRMATION_EXPIRED,
  });
};
