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
    if (!input.validFrom.trim()) {
      return "La fecha desde es obligatoria.";
    }

    if (input.validUntil.trim() && input.validUntil < input.validFrom) {
      return "La fecha hasta no puede ser anterior a la fecha desde.";
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
