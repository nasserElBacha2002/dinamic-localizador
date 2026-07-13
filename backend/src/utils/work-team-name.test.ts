import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeWorkTeamName } from "./work-team-name";

describe("normalizeWorkTeamName", () => {
  it("trims, lowercases and collapses spaces", () => {
    assert.equal(normalizeWorkTeamName("Equipo Norte"), "equipo norte");
    assert.equal(normalizeWorkTeamName(" equipo norte "), "equipo norte");
    assert.equal(normalizeWorkTeamName("EQUIPO NORTE"), "equipo norte");
    assert.equal(normalizeWorkTeamName("Equipo   Norte"), "equipo norte");
  });
});
