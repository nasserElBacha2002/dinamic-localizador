import type { RecommendationReason } from "../types/recommendation";

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

function proximityBucketCopy(bucket: unknown): string | null {
  switch (bucket) {
    case "SAME_ZONE":
    case "VERY_CLOSE":
      return "Su zona está muy cerca de la operación";
    case "CLOSE":
      return "Su zona está cerca de la operación";
    case "MEDIUM":
      return "Distancia moderada respecto de la operación";
    case "FAR":
      return "Mayor distancia respecto de la operación";
    default:
      return null;
  }
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
    case "LOCATION_PROXIMITY": {
      const specific = proximityBucketCopy(params.bucket);
      return specific ?? "Su zona tiene buena proximidad con la operación";
    }
    case "OPERATION_TYPE_EXPERIENCE":
      return "Tiene experiencia en este tipo de operación";
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
