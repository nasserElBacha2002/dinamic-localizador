import type { AttendanceStatisticsSummary } from "../../types/statistics";
import type { HomeAttentionViewModel } from "./home-dashboard-attention";

export function deriveShouldLoadLowCoverage(
  summary: AttendanceStatisticsSummary | undefined,
  summarySucceeded: boolean,
): boolean {
  return summarySucceeded && (summary?.incompleteCoverageOperations ?? 0) > 0;
}

export function deriveShouldLoadIncidentDetails(
  summary: AttendanceStatisticsSummary | undefined,
  summarySucceeded: boolean,
): boolean {
  return (
    summarySucceeded && (summary?.operationalIncidents?.operationsWithAnyIncident ?? 0) > 0
  );
}

export function computeAttentionLoading(flags: {
  summaryLoading: boolean;
  unavailableLoading: boolean;
  attentionEmployeesLoading: boolean;
  lowCoverageLoading: boolean;
  incidentDetailsLoading: boolean;
}): boolean {
  return (
    flags.summaryLoading ||
    flags.unavailableLoading ||
    flags.attentionEmployeesLoading ||
    flags.lowCoverageLoading ||
    flags.incidentDetailsLoading
  );
}

export type HomeAttentionPanelState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "ready"; model: HomeAttentionViewModel }
  | { status: "partial"; model: HomeAttentionViewModel; warnings: string[] };

export function resolveHomeAttentionPanelState(input: {
  loading: boolean;
  summaryErrorMessage?: string;
  sourceErrors: string[];
  model: HomeAttentionViewModel | null;
}): HomeAttentionPanelState {
  if (input.loading) {
    return { status: "loading" };
  }

  if (input.summaryErrorMessage) {
    return { status: "error", message: input.summaryErrorMessage };
  }

  if (!input.model) {
    const message =
      input.sourceErrors[0] ?? "No se pudo cargar la información de atención operativa.";
    return { status: "error", message };
  }

  const hasSourceErrors = input.sourceErrors.length > 0;

  if (hasSourceErrors && input.model.isEmpty) {
    return {
      status: "error",
      message:
        input.sourceErrors[0] ??
        "No se pudo confirmar si hay situaciones que requieran atención.",
    };
  }

  if (hasSourceErrors) {
    return {
      status: "partial",
      model: input.model,
      warnings: input.sourceErrors,
    };
  }

  if (input.model.isEmpty) {
    return { status: "empty" };
  }

  return { status: "ready", model: input.model };
}

export function shouldShowAttentionEmptyState(input: {
  loading: boolean;
  summaryFailed: boolean;
  anyEnabledSourceFailed: boolean;
  modelEmpty: boolean;
}): boolean {
  return (
    !input.loading &&
    !input.summaryFailed &&
    !input.anyEnabledSourceFailed &&
    input.modelEmpty
  );
}
