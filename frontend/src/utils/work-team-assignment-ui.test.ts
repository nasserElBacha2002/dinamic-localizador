import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getRecurringValidityErrors,
  getWorkTeamPreviewDisabledReason,
  hasRecurringValidityErrors,
} from "./work-team-assignment-ui";

describe("getRecurringValidityErrors", () => {
  it("requires a valid from date", () => {
    const errors = getRecurringValidityErrors("", "");
    assert.match(errors.validFrom ?? "", /obligatoria/);
    assert.equal(hasRecurringValidityErrors(errors), true);
  });

  it("rejects a valid until earlier than valid from", () => {
    const errors = getRecurringValidityErrors("2026-07-13", "2026-07-10");
    assert.equal(errors.validFrom, null);
    assert.match(errors.validUntil ?? "", /anterior/);
  });

  it("accepts an open-ended valid range", () => {
    const errors = getRecurringValidityErrors("2026-07-13", "");
    assert.equal(hasRecurringValidityErrors(errors), false);
  });

  it("accepts a valid bounded range", () => {
    const errors = getRecurringValidityErrors("2026-07-13", "2026-07-20");
    assert.equal(hasRecurringValidityErrors(errors), false);
  });

  it("rejects malformed dates", () => {
    const errors = getRecurringValidityErrors("13-07-2026", "2026-07-20");
    assert.match(errors.validFrom ?? "", /no es válida/);
  });
});

describe("getWorkTeamPreviewDisabledReason shares recurring validity rules", () => {
  it("blocks preview when recurring range is invalid", () => {
    const reason = getWorkTeamPreviewDisabledReason({
      isCompanyLoading: false,
      teamsLoading: false,
      teamsError: false,
      hasActiveTeams: true,
      selectedTeamIds: ["team-1"],
      validFrom: "2026-07-13",
      validUntil: "2026-07-10",
      isRecurring: true,
    });
    assert.match(reason ?? "", /anterior/);
  });

  it("allows preview for a valid recurring range", () => {
    const reason = getWorkTeamPreviewDisabledReason({
      isCompanyLoading: false,
      teamsLoading: false,
      teamsError: false,
      hasActiveTeams: true,
      selectedTeamIds: ["team-1"],
      validFrom: "2026-07-13",
      validUntil: "",
      isRecurring: true,
    });
    assert.equal(reason, null);
  });
});
