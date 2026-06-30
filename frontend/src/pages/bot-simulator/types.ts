import type { BotSimulatorMessage } from "../../api/bot-simulator.api";

export const BADGE_LABELS: Record<string, string> = {
  "Dry-run": "Simulación",
  Persistent: "Persistente",
  "Waiting for location": "Esperando ubicación",
  "Active session": "Sesión activa",
  "Requires review": "Requiere revisión",
  "Arrival registered": "Llegada registrada",
  "Departure registered": "Salida registrada",
  Error: "Error",
};

export type { BotSimulatorMessage };
