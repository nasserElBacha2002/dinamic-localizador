import { env } from "../config/env";
import type { BotSession } from "../types/twilio.types";
import { botSessionService } from "./bot-session.service";

export type ContextualRetryResult = {
  kind: "retry" | "cancelled" | "completed" | "expired" | "conflict";
  message: string;
};

const MAX_ATTEMPTS_MESSAGE =
  'Cancelé el flujo porque se alcanzó el máximo de intentos. Escribí "Menú" para comenzar de nuevo.';

const CONFLICT_MESSAGE =
  "Recibí otra respuesta al mismo tiempo. Revisá el último mensaje del bot.";
const COMPLETED_MESSAGE = "Ese flujo ya fue completado.";
const CANCELLED_MESSAGE = 'Ese flujo ya fue cancelado. Escribí "Menú" para comenzar otro.';
const EXPIRED_MESSAGE = 'Ese flujo venció. Escribí "Menú" para comenzar de nuevo.';

export const recordInvalidContextualInput = async (input: {
  companyId: string;
  session: BotSession;
  messageSid: string;
  retryMessage: string;
}): Promise<ContextualRetryResult> => {
  const result = await botSessionService.recordFailedAttempt(
    input.companyId,
    input.session,
    input.messageSid,
    env.CONVERSATION_MAX_FAILED_ATTEMPTS,
  );

  if (result.kind === "max_attempts") {
    return { kind: "cancelled", message: MAX_ATTEMPTS_MESSAGE };
  }
  if (result.kind === "completed") {
    return { kind: "completed", message: COMPLETED_MESSAGE };
  }
  if (result.kind === "cancelled") {
    return { kind: "cancelled", message: CANCELLED_MESSAGE };
  }
  if (result.kind === "expired") {
    return { kind: "expired", message: EXPIRED_MESSAGE };
  }
  if (result.kind === "conflict") {
    return { kind: "conflict", message: CONFLICT_MESSAGE };
  }
  return { kind: "retry", message: input.retryMessage };
};
