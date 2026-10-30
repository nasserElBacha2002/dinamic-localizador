import sql from "mssql";
import { getBotRuntimeContext } from "./bot-runtime-context";

export type BotSessionScope =
  | { mode: "production" }
  | { mode: "simulation"; simulationSessionId: string };

export function resolveBotSessionScope(explicit?: BotSessionScope): BotSessionScope {
  if (explicit) {
    return explicit;
  }

  const simulationSessionId = getBotRuntimeContext()?.simulationSessionId;
  if (simulationSessionId) {
    return { mode: "simulation", simulationSessionId };
  }

  return { mode: "production" };
}

export function applyBotSessionScope(
  request: sql.Request,
  scope: BotSessionScope,
  columnPrefix = "",
): string {
  if (scope.mode === "simulation") {
    request.input("simulationSessionId", sql.UniqueIdentifier, scope.simulationSessionId);
    return ` AND ${columnPrefix}is_simulation = 1 AND ${columnPrefix}simulation_session_id = @simulationSessionId`;
  }

  return ` AND ${columnPrefix}is_simulation = 0`;
}

export function getBotSessionCreateFlags(scope: BotSessionScope): {
  isSimulation: boolean;
  simulationSessionId: string | null;
} {
  if (scope.mode === "simulation") {
    return { isSimulation: true, simulationSessionId: scope.simulationSessionId };
  }

  return { isSimulation: false, simulationSessionId: null };
}
