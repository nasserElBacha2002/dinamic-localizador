import { isDateOnlyString } from "./date-only";

export interface RecurringValidityErrors {
  validFrom: string | null;
  validUntil: string | null;
}

/**
 * Shared recurring validity rules used by both the individual and group
 * assignment panels so their date logic never diverges.
 */
export function getRecurringValidityErrors(
  validFrom: string,
  validUntil: string,
): RecurringValidityErrors {
  const from = validFrom.trim();
  const until = validUntil.trim();

  let validFromError: string | null = null;
  let validUntilError: string | null = null;

  if (!from) {
    validFromError = "La fecha desde es obligatoria.";
  } else if (!isDateOnlyString(from)) {
    validFromError = "La fecha desde no es válida.";
  }

  if (until) {
    if (!isDateOnlyString(until)) {
      validUntilError = "La fecha hasta no es válida.";
    } else if (from && until < from) {
      validUntilError = "La fecha hasta no puede ser anterior a la fecha desde.";
    }
  }

  return { validFrom: validFromError, validUntil: validUntilError };
}

export function hasRecurringValidityErrors(errors: RecurringValidityErrors): boolean {
  return Boolean(errors.validFrom || errors.validUntil);
}

export function getWorkTeamPreviewDisabledReason(input: {
  isCompanyLoading: boolean;
  teamsLoading: boolean;
  teamsError: boolean;
  hasActiveTeams: boolean;
  selectedTeamIds: string[];
  validFrom: string;
  validUntil: string;
  isRecurring: boolean;
}): string | null {
  if (input.isCompanyLoading || input.teamsLoading || input.teamsError) {
    return null;
  }

  if (!input.hasActiveTeams) {
    return null;
  }

  if (input.selectedTeamIds.length === 0) {
    return "Seleccioná al menos un grupo.";
  }

  if (input.isRecurring) {
    const errors = getRecurringValidityErrors(input.validFrom, input.validUntil);
    if (errors.validFrom) {
      return errors.validFrom;
    }
    if (errors.validUntil) {
      return errors.validUntil;
    }
  }

  return null;
}

export function buildWorkTeamSelectOptions(
  teams: Array<{
    id: string;
    name: string;
    activeMemberCount?: number;
    memberCount?: number;
  }>,
) {
  return teams.map((team) => ({
    value: team.id,
    label: `${team.name} (${team.activeMemberCount ?? team.memberCount ?? 0} colaboradores)`,
  }));
}
