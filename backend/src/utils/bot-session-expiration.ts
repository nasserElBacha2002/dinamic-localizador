import type { BotSessionState } from "../types/twilio.types";
import { ACTIVE_BOT_SESSION_STATES } from "./bot-session-states";

export const ACTIVE_SESSION_STATES = ACTIVE_BOT_SESSION_STATES satisfies readonly BotSessionState[];

export const EXPIRED_SESSION_USER_MESSAGE =
  'La solicitud anterior venció.\nEscribí "Llegué" para registrar llegada o "Me voy" para registrar salida.';

export const buildSessionExpiresAt = (ttlMinutes: number, now = new Date()): Date =>
  new Date(now.getTime() + ttlMinutes * 60_000);

export const isActiveSessionState = (state: BotSessionState): boolean =>
  (ACTIVE_SESSION_STATES as readonly BotSessionState[]).includes(state);

export const isSessionTimeValid = (expiresAt: string | Date, now = new Date()): boolean =>
  new Date(expiresAt).getTime() > now.getTime();

export const isSessionActive = (
  session: Pick<{ state: BotSessionState; expiresAt: string }, "state" | "expiresAt">,
  now = new Date(),
): boolean => isActiveSessionState(session.state) && isSessionTimeValid(session.expiresAt, now);

export const isSessionExpiredByTime = (
  session: Pick<{ state: BotSessionState; expiresAt: string }, "state" | "expiresAt">,
  now = new Date(),
): boolean => isActiveSessionState(session.state) && !isSessionTimeValid(session.expiresAt, now);
