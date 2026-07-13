import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeWorkTeamName } from "../utils/work-team-name";
import { hashWorkTeamMembers } from "../utils/work-team-snapshot-hash";
import { classifyAssignmentOverlap } from "../services/operation-assignment-core.service";

describe("work team utilities", () => {
  it("normalizes equivalent team names", () => {
    assert.equal(normalizeWorkTeamName("Equipo Norte"), "equipo norte");
    assert.equal(normalizeWorkTeamName(" equipo norte "), "equipo norte");
    assert.equal(normalizeWorkTeamName("Equipo   Norte"), "equipo norte");
  });

  it("builds stable member hashes", () => {
    const first = hashWorkTeamMembers(["b", "a", "a"]);
    const second = hashWorkTeamMembers(["a", "b"]);
    assert.equal(first, second);
  });
});

describe("classifyAssignmentOverlap", () => {
  it("detects exact period as already_assigned", () => {
    const reason = classifyAssignmentOverlap(
      {
        id: "1",
        companyId: "c",
        operationId: "o",
        employeeId: "e",
        validFrom: "2026-07-10",
        validUntil: "2026-07-10",
        assignedAt: "",
        createdAt: "",
        updatedAt: "",
      },
      "2026-07-10",
      "2026-07-10",
    );
    assert.equal(reason, "already_assigned");
  });

  it("detects partial overlap", () => {
    const reason = classifyAssignmentOverlap(
      {
        id: "1",
        companyId: "c",
        operationId: "o",
        employeeId: "e",
        validFrom: "2026-07-01",
        validUntil: null,
        assignedAt: "",
        createdAt: "",
        updatedAt: "",
      },
      "2026-07-10",
      null,
    );
    assert.equal(reason, "assignment_period_overlap");
  });
});
