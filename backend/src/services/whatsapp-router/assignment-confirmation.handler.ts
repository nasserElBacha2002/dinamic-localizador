import { resolveOperationOptionsFromSessionContext } from "../../utils/legacy-operation-session-context";
import { botSessionService } from "../bot-session.service";
import { employeeWorkdayService } from "../employee-workday.service";
import { INVALID_SELECTION_MESSAGE } from "../bot/bot-response.builder";
import { getAssignmentConfirmationModuleBlockedMessage } from "../whatsapp-module-gate";
import { isAssignmentSelectionSessionState } from "../../utils/bot-session-states";
import { parseOptionalAssignmentSelection } from "../../utils/assignment-intent";
import { setLastDetectedIntent } from "../../utils/bot-runtime-context";
import {
  isValidOperationSelection,
  parseOperationSelectionIndex,
} from "../bot/bot-operation.selector";
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

  const selection = parseOperationSelectionIndex(ctx.body);
  const options = resolveOperationOptionsFromSessionContext(botSessionService.parseContext(session.contextJson)) ?? [];

  if (!isValidOperationSelection(selection, options.length)) {
    return respond(ctx, handlers, INVALID_SELECTION_MESSAGE);
  }

  const selected = options[selection - 1];
  if (session.state === "WAITING_CONFIRM_ATTENDANCE_SELECTION") {
    const result = await employeeWorkdayService.confirmAssignment(
      ctx.companyId,
      ctx.employeeId!,
      selected.operationId,
    );
    await completeSelectionSession(ctx.companyId, session);
    return respond(ctx, handlers, result.message);
  }

  const result = await employeeWorkdayService.markAssignmentUnavailable(
    ctx.companyId,
    ctx.employeeId!,
    selected.operationId,
  );
  await completeSelectionSession(ctx.companyId, session);
  return respond(ctx, handlers, result.message);
};

const handleAssignmentSelectionFlow = async (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
  assignments: Awaited<ReturnType<typeof employeeWorkdayService.listConfirmableAssignments>>,
  options: {
    emptyMessage: string;
    applyToAssignment: (
      companyId: string,
      employeeId: string,
      operationId: string,
    ) => Promise<{ message: string }>;
    createSelectionSession: (selectionOptions: ReturnType<typeof employeeWorkdayService.mapToSelectionOptions>) => Promise<void>;
    buildSelectionPrompt: (items: typeof assignments) => string;
  },
): Promise<string> => {
  if (assignments.length === 0) {
    return respond(ctx, handlers, options.emptyMessage);
  }

  const explicitSelection = parseOptionalAssignmentSelection(ctx.body);
  if (explicitSelection !== null) {
    if (!isValidOperationSelection(explicitSelection, assignments.length)) {
      return respond(ctx, handlers, INVALID_SELECTION_MESSAGE);
    }

    const selected = assignments[explicitSelection - 1];
    const result = await options.applyToAssignment(
      ctx.companyId,
      ctx.employeeId!,
      selected.operationId,
    );
    return respond(ctx, handlers, result.message);
  }

  if (assignments.length === 1) {
    const result = await options.applyToAssignment(
      ctx.companyId,
      ctx.employeeId!,
      assignments[0].operationId,
    );
    return respond(ctx, handlers, result.message);
  }

  await options.createSelectionSession(employeeWorkdayService.mapToSelectionOptions(assignments));
  return respond(ctx, handlers, options.buildSelectionPrompt(assignments));
};

export const handleConfirmAttendanceIntent = async (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
): Promise<string> => {
  setLastDetectedIntent("confirm-attendance");
  const blockedMessage = getAssignmentConfirmationModuleBlockedMessage(ctx.moduleStates);
  if (blockedMessage) {
    logModuleBlocked(ctx.companyId, "operations");
    return respond(ctx, handlers, blockedMessage);
  }

  const assignments = await employeeWorkdayService.listConfirmableAssignments(
    ctx.companyId,
    ctx.employeeId!,
  );

  return handleAssignmentSelectionFlow(ctx, handlers, assignments, {
    emptyMessage: employeeWorkdayService.noConfirmableMessage,
    applyToAssignment: async (companyId, employeeId, operationId) => {
      const result = await employeeWorkdayService.confirmAssignment(companyId, employeeId, operationId);
      return { message: result.message };
    },
    createSelectionSession: async (selectionOptions) => {
      await botSessionService.createConfirmAttendanceSelectionSession(ctx.companyId, {
        employeeId: ctx.employeeId!,
        phoneNumber: ctx.phoneFrom,
        options: selectionOptions,
      });
    },
    buildSelectionPrompt: (items) => employeeWorkdayService.buildConfirmSelectionPrompt(items),
  });
};

export const handleUnavailabilityIntent = async (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
): Promise<string> => {
  setLastDetectedIntent("report-unavailability");
  const blockedMessage = getAssignmentConfirmationModuleBlockedMessage(ctx.moduleStates);
  if (blockedMessage) {
    logModuleBlocked(ctx.companyId, "operations");
    return respond(ctx, handlers, blockedMessage);
  }

  const assignments = await employeeWorkdayService.listUnavailabilityAssignments(
    ctx.companyId,
    ctx.employeeId!,
  );

  return handleAssignmentSelectionFlow(ctx, handlers, assignments, {
    emptyMessage: employeeWorkdayService.noUnavailabilityMessage,
    applyToAssignment: async (companyId, employeeId, operationId) => {
      const result = await employeeWorkdayService.markAssignmentUnavailable(
        companyId,
        employeeId,
        operationId,
      );
      return { message: result.message };
    },
    createSelectionSession: async (selectionOptions) => {
      await botSessionService.createUnavailabilitySelectionSession(ctx.companyId, {
        employeeId: ctx.employeeId!,
        phoneNumber: ctx.phoneFrom,
        options: selectionOptions,
      });
    },
    buildSelectionPrompt: (items) => employeeWorkdayService.buildUnavailabilitySelectionPrompt(items),
  });
};
