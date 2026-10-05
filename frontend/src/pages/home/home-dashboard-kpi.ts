export type HomeKpiVisualTone = "neutral" | "info" | "success" | "warning" | "danger";

export function resolvePrimaryKpiTone(key: string, numericValue: number): HomeKpiVisualTone {
  switch (key) {
    case "scheduled":
      return numericValue > 0 ? "info" : "neutral";
    case "present":
      return numericValue > 0 ? "success" : "neutral";
    case "expected":
      return numericValue > 0 ? "info" : "neutral";
    case "absent":
      return numericValue > 0 ? "danger" : "neutral";
    case "unavailable":
      return numericValue > 0 ? "warning" : "neutral";
    case "late":
      return numericValue > 0 ? "warning" : "neutral";
    default:
      return "neutral";
  }
}

export function resolveSecondaryKpiTone(key: string, numericValue: number): HomeKpiVisualTone {
  switch (key) {
    case "justified":
      return numericValue > 0 ? "info" : "neutral";
    case "attendanceRate":
    case "punctuality":
      return "neutral";
    case "irregularities":
    case "open":
    case "incompleteCoverage":
      return numericValue > 0 ? "warning" : "neutral";
    default:
      return "neutral";
  }
}

export const homeKpiToneColor: Record<HomeKpiVisualTone, string | undefined> = {
  neutral: "dimmed",
  info: "blue",
  success: "green",
  warning: "orange",
  danger: "red",
};
