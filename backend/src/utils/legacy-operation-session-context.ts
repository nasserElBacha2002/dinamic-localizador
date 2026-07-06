import type { BotSessionContext } from "../types/twilio.types";

export const resolveOperationIdFromSessionContext = (
  context: BotSessionContext,
): string | undefined =>
  context.attendanceConfirmation?.operationId ?? context.attendanceConfirmation?.inventoryId;

export const resolveOperationOptionsFromSessionContext = (
  context: BotSessionContext,
) => context.operationOptions ?? context.inventoryOptions;
