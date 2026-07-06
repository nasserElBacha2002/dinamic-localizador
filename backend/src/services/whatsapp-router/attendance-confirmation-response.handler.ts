import { botSessionService } from "../bot-session.service";
import { employeeWorkdayService } from "../employee-workday.service";
import {
  formatAssignmentDateTimeLine,
} from "../../utils/employee-assignment-format";
import { companyOperationalSettingsService } from "../company-operational-settings.service";
import { parseAttendanceConfirmationReply } from "../../utils/attendance-confirmation-reply";
import { isAttendanceConfirmationResponseSessionState } from "../../utils/bot-session-states";
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
  "Ya no estás asignado a ese servicio. Si necesitás ayuda, contactá a administración.";

const resolveCompanyTimezone = async (companyId: string): Promise<string> => {
  const settings = await companyOperationalSettingsService.getCompanyOperationalSettings(companyId);
  return settings.operationTimezone;
};

const respond = (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
  message: string,
): Promise<string> =>
  handlers.respond(ctx.companyId, {
    message,
    employeeId: ctx.employeeId,
    phoneFrom: ctx.phoneTo,
    phoneTo: ctx.phoneFrom,
  });

export const handleActiveAttendanceConfirmationResponseSession = async (
  ctx: WhatsAppRouterContext,
  session: BotSession,
  handlers: WhatsAppRouterHandlers,
): Promise<string | null> => {
  if (!isAttendanceConfirmationResponseSessionState(session.state)) {
    return null;
  }

  const context = botSessionService.parseContext(session.contextJson);
  const inventoryId = context.attendanceConfirmation?.inventoryId;
  if (!inventoryId || !ctx.employeeId) {
    await botSessionService.completeSession(ctx.companyId, session.id);
    return respond(ctx, handlers, AMBIGUOUS_REPLY_MESSAGE);
  }

  const replyIntent = parseAttendanceConfirmationReply(ctx.body ?? "");
  if (replyIntent === "unknown") {
    return respond(ctx, handlers, AMBIGUOUS_REPLY_MESSAGE);
  }

  if (replyIntent === "affirmative") {
    const result = await employeeWorkdayService.confirmAssignment(
      ctx.companyId,
      ctx.employeeId,
      inventoryId,
    );

    if (result.kind === "not_found") {
      await botSessionService.completeSession(ctx.companyId, session.id);
      return respond(ctx, handlers, NOT_ASSIGNED_MESSAGE);
    }

    await botSessionService.completeSession(ctx.companyId, session.id);

    if (result.kind === "ok") {
      const timeZone = await resolveCompanyTimezone(ctx.companyId);
      const assignment = await employeeWorkdayService.getAssignmentForResponseMessage(
        ctx.companyId,
        ctx.employeeId,
        inventoryId,
      );
      if (assignment) {
        return respond(
          ctx,
          handlers,
          [
            "✅ Asistencia confirmada.",
            "",
            `Te esperamos en ${assignment.storeName} el ${formatAssignmentDateTimeLine(assignment, timeZone)}.`,
            "",
            'Cuando llegues, recordá enviar "Llegué" y compartir tu ubicación.',
          ].join("\n"),
        );
      }
    }

    return respond(ctx, handlers, result.message);
  }

  const result = await employeeWorkdayService.markAssignmentUnavailable(
    ctx.companyId,
    ctx.employeeId,
    inventoryId,
  );

  if (result.kind === "not_found") {
    await botSessionService.completeSession(ctx.companyId, session.id);
    return respond(ctx, handlers, NOT_ASSIGNED_MESSAGE);
  }

  await botSessionService.completeSession(ctx.companyId, session.id);

  if (result.kind === "ok") {
    const timeZone = await resolveCompanyTimezone(ctx.companyId);
    const assignment = await employeeWorkdayService.getAssignmentForResponseMessage(
      ctx.companyId,
      ctx.employeeId,
      inventoryId,
    );
    if (assignment) {
      return respond(
        ctx,
        handlers,
        `Registramos que no vas a poder asistir al servicio asignado en ${assignment.storeName} el ${formatAssignmentDateTimeLine(assignment, timeZone)}.`,
      );
    }
  }

  return respond(ctx, handlers, result.message);
};
