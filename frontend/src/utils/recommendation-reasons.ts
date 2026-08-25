import type { RecommendationReason } from "../types/recommendation";
import { formatApproximateDistance } from "./format-approximate-distance";

/** Compatibility score [0,1] → affinity percentage for display (not probability). */
export function formatAffinityPercent(score: number): string {
  if (!Number.isFinite(score)) {
    return "0%";
  }
  const pct = Math.round(Math.min(1, Math.max(0, score)) * 100);
  return `${pct}%`;
}

export function formatAffinityLabel(score: number): string {
  return `${formatAffinityPercent(score)} de afinidad`;
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.floor(value);
}

function asNonNegativeMeters(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

/** Bucket-only fallback when distanceMeters is absent (rolling deploy / older API). */
function proximityBucketCopy(bucket: unknown): string | null {
  switch (bucket) {
    case "SAME_ZONE":
      return "Misma zona que el servicio";
    case "VERY_CLOSE":
      return "Muy cerca del servicio";
    case "CLOSE":
      return "Cerca del servicio";
    case "MEDIUM":
      return "Distancia moderada respecto del servicio";
    case "FAR":
      return "Mayor distancia respecto del servicio";
    default:
      return null;
  }
}

function formatLocationProximityReason(params: Record<string, unknown>): string | null {
  const bucket = params.bucket;

  if (bucket === "SAME_ZONE") {
    return "Misma zona que el servicio";
  }

  // UNKNOWN should not appear as a positive reason.
  if (bucket === "UNKNOWN") {
    return null;
  }

  // Explicit null distanceMeters (SAME_ZONE contract) — already handled above.
  const meters = asNonNegativeMeters(params.distanceMeters);
  if (meters !== null) {
    const approx = formatApproximateDistance(meters);
    if (approx) {
      // "Aprox." + strip leading "~" from formatter to avoid "Aprox. ~2,4 km".
      const distanceLabel = approx.startsWith("~") ? approx.slice(1) : approx;
      return `Aprox. ${distanceLabel} del servicio`;
    }
  }

  return proximityBucketCopy(bucket) ?? "Zona con buena proximidad al servicio";
}

/**
 * Maps backend reason codes + params to Spanish UI copy.
 * Unknown codes degrade safely (omit or generic). Returns null to omit.
 */
export function formatRecommendationReason(reason: RecommendationReason): string | null {
  const params = reason.params ?? {};

  switch (reason.code) {
    case "TEAM_AFFINITY": {
      const matched = asPositiveInt(params.matchedTeamMembers);
      const shared = asPositiveInt(params.sharedOccurrences);
      if (matched !== null && shared !== null) {
        const people =
          matched === 1 ? "1 integrante del equipo actual" : `${matched} integrantes del equipo actual`;
        const times = shared === 1 ? "1 vez" : `${shared} veces`;
        return `Trabajó ${times} con ${people}`;
      }
      return "Trabajó anteriormente con integrantes del equipo actual";
    }
    case "RECENT_COLLABORATION":
      return "Trabajó recientemente con integrantes del equipo";
    case "SERVICE_EXPERIENCE": {
      const workdays = asPositiveInt(params.serviceWorkdays);
      if (workdays !== null) {
        const label = workdays === 1 ? "1 jornada anterior" : `${workdays} jornadas anteriores`;
        return `Trabajó ${label} en esta sucursal`;
      }
      return "Tiene experiencia previa en esta sucursal";
    }
    case "LOCATION_PROXIMITY":
      return formatLocationProximityReason(params);
    case "OPERATION_TYPE_EXPERIENCE":
      return "Tiene experiencia en este tipo de operación";
    case "TEAM_HISTORY_COVERAGE": {
      const members = asPositiveInt(params.members);
      const connected = asPositiveInt(params.membersWithConnections);
      if (members !== null && connected !== null) {
        return `${connected} de los ${members} integrantes ya tienen historial trabajando entre sí`;
      }
      return "El equipo tiene historial de colaboración entre varios integrantes";
    }
    case "TEAM_SERVICE_EXPERIENCE": {
      const experienced = asPositiveInt(params.experiencedMembers);
      const teamSize = asPositiveInt(params.teamSize);
      if (experienced !== null && teamSize !== null) {
        return `${experienced} de ${teamSize} tienen experiencia previa en esta sucursal`;
      }
      return "Varios integrantes tienen experiencia previa en esta sucursal";
    }
    case "TEAM_LOCATION_PROXIMITY": {
      // Aggregate member counts — no team-level km (would invent an average).
      const close = asPositiveInt(params.closeMembers);
      const teamSize = asPositiveInt(params.teamSize);
      if (close !== null && teamSize !== null) {
        return `${close} de ${teamSize} tienen buena proximidad con la operación`;
      }
      return "Varios integrantes tienen buena proximidad con la operación";
    }
    case "TEAM_RECENT_COLLABORATION":
      return "Existen colaboraciones recientes dentro del grupo";
    case "TEAM_ISOLATION_NOTE": {
      const connected = asPositiveInt(params.connectedMembers);
      const teamSize = asPositiveInt(params.teamSize);
      if (connected !== null && teamSize !== null) {
        return `${connected} de ${teamSize} tienen historial conjunto; el resto puede ser incorporación nueva`;
      }
      return "Algunos integrantes aún no tienen historial conjunto con el resto";
    }
    default:
      return "Motivo adicional considerado por la IA";
  }
}

export function formatRecommendationReasons(reasons: RecommendationReason[]): string[] {
  const lines: string[] = [];
  for (const reason of reasons) {
    const line = formatRecommendationReason(reason);
    if (line) {
      lines.push(line);
    }
  }
  return lines;
}

/** Short headline under the name — first concrete reason, or generic. */
export function recommendationHeadline(reasons: RecommendationReason[]): string | null {
  const lines = formatRecommendationReasons(reasons);
  return lines[0] ?? null;
}
