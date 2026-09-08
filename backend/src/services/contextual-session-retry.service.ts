import { env } from "../config/env";
import type { BotSession } from "../types/twilio.types";
import { botSessionService } from "./bot-session.service";

export type ContextualRetryResult = {
  kind: "retry" | "cancelled" | "conflict";
  message: string;
};

const MAX_ATTEMPTS_MESSAGE =
  'Cancelé el flujo porque se alcanzó el máximo de intentos. Escribí "Menú" para comenzar de nuevo.';

const CONFLICT_MESSAGE =
  "Recibí otra respuesta al mismo tiempo. Revisá el último mensaje del bot.";

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
  if (result.kind === "conflict") {
    return { kind: "conflict", message: CONFLICT_MESSAGE };
  }
  return { kind: "retry", message: input.retryMessage };
};
