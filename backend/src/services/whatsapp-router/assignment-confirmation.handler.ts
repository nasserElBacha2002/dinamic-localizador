import { botSessionService } from "../bot-session.service";
import { employeeWorkdayService } from "../employee-workday.service";
import { INVALID_SELECTION_MESSAGE } from "../bot/bot-response.builder";
import { getAssignmentConfirmationModuleBlockedMessage } from "../whatsapp-module-gate";
import { isAssignmentSelectionSessionState } from "../../utils/bot-session-states";
import { parseOptionalAssignmentSelection } from "../../utils/assignment-intent";
import { setLastDetectedIntent } from "../../utils/bot-runtime-context";
import {
  isValidInventorySelection,
  parseInventorySelectionIndex,
} from "../bot/bot-inventory.selector";
import { logModuleBlocked } from "./module-session-gate";
import type { WhatsAppRouterContext, WhatsAppRouterHandlers } from "./whatsapp-router.types";
import type { BotSession } from "../../types/twilio.types";

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

const completeSelectionSession = async (
  companyId: string,
  session: BotSession,
): Promise<void> => {
  await botSessionService.completeSession(companyId, session.id);
};

export const handleActiveAssignmentSelectionSession = async (
  ctx: WhatsAppRouterContext,
  session: BotSession,
  handlers: WhatsAppRouterHandlers,
): Promise<string | null> => {
  if (!isAssignmentSelectionSessionState(session.state)) {
    return null;
  }

  const selection = parseInventorySelectionIndex(ctx.body);
  const options = botSessionService.parseContext(session.contextJson).inventoryOptions ?? [];

  if (!isValidInventorySelection(selection, options.length)) {
    return respond(ctx, handlers, INVALID_SELECTION_MESSAGE);
  }

  const selected = options[selection - 1];
  if (session.state === "WAITING_CONFIRM_ATTENDANCE_SELECTION") {
    const result = await employeeWorkdayService.confirmAssignment(
      ctx.companyId,
      ctx.employeeId!,
      selected.inventoryId,
    );
    await completeSelectionSession(ctx.companyId, session);
    return respond(ctx, handlers, result.message);
  }

  const result = await employeeWorkdayService.markAssignmentUnavailable(
    ctx.companyId,
    ctx.employeeId!,
    selected.inventoryId,
  );
  await completeSelectionSession(ctx.companyId, session);
  return respond(ctx, handlers, result.message);
};

export const handleConfirmAttendanceIntent = async (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
): Promise<string> => {
  setLastDetectedIntent("confirm-attendance");
  const blockedMessage = getAssignmentConfirmationModuleBlockedMessage(ctx.moduleStates);
  if (blockedMessage) {
    logModuleBlocked(ctx.companyId, "inventory_operations");
    return respond(ctx, handlers, blockedMessage);
  }

  const assignments = await employeeWorkdayService.listConfirmableAssignments(
    ctx.companyId,
    ctx.employeeId!,
  );

  if (assignments.length === 0) {
    return respond(ctx, handlers, employeeWorkdayService.noConfirmableMessage);
  }

  const explicitSelection = parseOptionalAssignmentSelection(ctx.body);
  if (explicitSelection !== null && assignments.length > 1) {
    if (!isValidInventorySelection(explicitSelection, assignments.length)) {
      return respond(ctx, handlers, INVALID_SELECTION_MESSAGE);
    }
    const selected = assignments[explicitSelection - 1];
    const result = await employeeWorkdayService.confirmAssignment(
      ctx.companyId,
      ctx.employeeId!,
      selected.inventoryId,
    );
    return respond(ctx, handlers, result.message);
  }

  if (assignments.length === 1) {
    const result = await employeeWorkdayService.confirmAssignment(
      ctx.companyId,
      ctx.employeeId!,
      assignments[0].inventoryId,
    );
    return respond(ctx, handlers, result.message);
  }

  await botSessionService.createConfirmAttendanceSelectionSession(ctx.companyId, {
    employeeId: ctx.employeeId!,
    phoneNumber: ctx.phoneFrom,
    options: employeeWorkdayService.mapToSelectionOptions(assignments),
  });

  return respond(ctx, handlers, employeeWorkdayService.buildConfirmSelectionPrompt(assignments));
};

export const handleUnavailabilityIntent = async (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
): Promise<string> => {
  setLastDetectedIntent("report-unavailability");
  const blockedMessage = getAssignmentConfirmationModuleBlockedMessage(ctx.moduleStates);
  if (blockedMessage) {
    logModuleBlocked(ctx.companyId, "inventory_operations");
    return respond(ctx, handlers, blockedMessage);
  }

  const assignments = await employeeWorkdayService.listUnavailabilityAssignments(
    ctx.companyId,
    ctx.employeeId!,
  );

  if (assignments.length === 0) {
    return respond(ctx, handlers, employeeWorkdayService.noUnavailabilityMessage);
  }

  const explicitSelection = parseOptionalAssignmentSelection(ctx.body);
  if (explicitSelection !== null && assignments.length > 1) {
    if (!isValidInventorySelection(explicitSelection, assignments.length)) {
      return respond(ctx, handlers, INVALID_SELECTION_MESSAGE);
    }
    const selected = assignments[explicitSelection - 1];
    const result = await employeeWorkdayService.markAssignmentUnavailable(
      ctx.companyId,
      ctx.employeeId!,
      selected.inventoryId,
    );
    return respond(ctx, handlers, result.message);
  }

  if (assignments.length === 1) {
    const result = await employeeWorkdayService.markAssignmentUnavailable(
      ctx.companyId,
      ctx.employeeId!,
      assignments[0].inventoryId,
    );
    return respond(ctx, handlers, result.message);
  }

  await botSessionService.createUnavailabilitySelectionSession(ctx.companyId, {
    employeeId: ctx.employeeId!,
    phoneNumber: ctx.phoneFrom,
    options: employeeWorkdayService.mapToSelectionOptions(assignments),
  });

  return respond(ctx, handlers, employeeWorkdayService.buildUnavailabilitySelectionPrompt(assignments));
};
