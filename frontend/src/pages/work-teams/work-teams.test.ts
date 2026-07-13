import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWorkTeamSelectOptions,
  getWorkTeamPreviewDisabledReason,
} from "../../utils/work-team-assignment-ui";

describe("getWorkTeamPreviewDisabledReason", () => {
  it("requires at least one selected group", () => {
    assert.equal(
      getWorkTeamPreviewDisabledReason({
        isCompanyLoading: false,
        teamsLoading: false,
        teamsError: false,
        hasActiveTeams: true,
        selectedTeamIds: [],
        validFrom: "2026-07-13",
        validUntil: "",
        isRecurring: false,
      }),
      "Seleccioná al menos un grupo.",
    );
  });

  it("does not ask for selection when there are no active teams", () => {
    assert.equal(
      getWorkTeamPreviewDisabledReason({
        isCompanyLoading: false,
        teamsLoading: false,
        teamsError: false,
        hasActiveTeams: false,
        selectedTeamIds: [],
        validFrom: "2026-07-13",
        validUntil: "",
        isRecurring: false,
      }),
      null,
    );
  });

  it("allows preview when a group is selected for one-time operations", () => {
    assert.equal(
      getWorkTeamPreviewDisabledReason({
        isCompanyLoading: false,
        teamsLoading: false,
        teamsError: false,
        hasActiveTeams: true,
        selectedTeamIds: ["team-1"],
        validFrom: "2026-07-13",
        validUntil: "",
        isRecurring: false,
      }),
      null,
    );
  });

  it("validates recurring date ranges", () => {
    assert.equal(
      getWorkTeamPreviewDisabledReason({
        isCompanyLoading: false,
        teamsLoading: false,
        teamsError: false,
        hasActiveTeams: true,
        selectedTeamIds: ["team-1"],
        validFrom: "",
        validUntil: "",
        isRecurring: true,
      }),
      "La fecha desde es obligatoria.",
    );

    assert.equal(
      getWorkTeamPreviewDisabledReason({
        isCompanyLoading: false,
        teamsLoading: false,
        teamsError: false,
        hasActiveTeams: true,
        selectedTeamIds: ["team-1"],
        validFrom: "2026-08-01",
        validUntil: "2026-07-01",
        isRecurring: true,
      }),
      "La fecha hasta no puede ser anterior a la fecha desde.",
    );
  });

  it("does not show validation while loading", () => {
    assert.equal(
      getWorkTeamPreviewDisabledReason({
        isCompanyLoading: true,
        teamsLoading: false,
        teamsError: false,
        hasActiveTeams: true,
        selectedTeamIds: [],
        validFrom: "",
        validUntil: "",
        isRecurring: true,
      }),
      null,
    );
  });
});

describe("buildWorkTeamSelectOptions", () => {
  it("maps active member counts into option labels", () => {
    const options = buildWorkTeamSelectOptions([
      { id: "team-1", name: "Equipo Norte", activeMemberCount: 3, memberCount: 4 },
    ]);

    assert.deepEqual(options, [
      { value: "team-1", label: "Equipo Norte (3 colaboradores)" },
    ]);
  });
});
