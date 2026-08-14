import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  composeTeamAlternatives,
  composeTeamGreedy,
} from "./team-composition-engine";
import {
  buildTeamPairMap,
  buildTeamReasons,
  scoreTeam,
  type TeamMemberFeatures,
  type TeamPairEdge,
} from "./team-scorer";

const member = (
  id: string,
  overrides: Partial<TeamMemberFeatures> = {},
): TeamMemberFeatures => ({
  employeeId: id,
  serviceWorkdayCount: 0,
  locationBucket: "UNKNOWN",
  ...overrides,
});

const edge = (
  a: string,
  b: string,
  shared: number,
  recent90 = shared,
): TeamPairEdge => {
  const [employeeAId, employeeBId] = a < b ? [a, b] : [b, a];
  return {
    employeeAId,
    employeeBId,
    sharedOccurrences: shared,
    lastSharedAt: "2026-06-01",
    recent90,
    mid365: 0,
    older: 0,
  };
};

describe("team-composition-engine V1", () => {
  it("selects the strong historical cluster for teamSize=3", () => {
    const candidates = ["A", "B", "C", "D", "E", "F"].map((id) => member(id));
    const pairMap = buildTeamPairMap([
      edge("A", "B", 15),
      edge("A", "C", 12),
      edge("B", "C", 11),
      edge("A", "D", 1),
      edge("E", "F", 10),
    ]);

    const result = composeTeamGreedy(
      {
        teamSize: 3,
        lockedIds: [],
        candidates,
        pairMap,
        serviceContextAvailable: false,
        locationContextAvailable: false,
      },
      new Map(),
    );

    assert.deepEqual([...result.memberIds].sort(), ["A", "B", "C"]);
  });

  it("prefers group coherence over a higher individual isolate", () => {
    // D has strong solo prior via many edges? Make D weakly connected;
    // C connects A/B tightly. Individual-style score would favor D if we only
    // looked at max edge to empty team — composition should still pick C with A/B.
    const candidates = ["A", "B", "C", "D"].map((id) => member(id));
    const pairMap = buildTeamPairMap([
      edge("A", "B", 10),
      edge("A", "C", 9),
      edge("B", "C", 8),
      edge("D", "A", 0),
      // D has a strong pair with an outsider not in play — only weak to team seed
    ]);

    const withC = scoreTeam(["A", "B", "C"], new Map(candidates.map((c) => [c.employeeId, c])), pairMap, {
      serviceContextAvailable: false,
      locationContextAvailable: false,
    });
    const withD = scoreTeam(["A", "B", "D"], new Map(candidates.map((c) => [c.employeeId, c])), pairMap, {
      serviceContextAvailable: false,
      locationContextAvailable: false,
    });
    assert.ok(withC.score > withD.score);

    const result = composeTeamGreedy(
      {
        teamSize: 3,
        lockedIds: ["A", "B"],
        candidates: candidates.filter((c) => c.employeeId === "C" || c.employeeId === "D"),
        pairMap,
        serviceContextAvailable: false,
        locationContextAvailable: false,
      },
      new Map(candidates.map((c) => [c.employeeId, c])),
    );
    assert.ok(result.memberIds.includes("C"));
    assert.ok(!result.memberIds.includes("D"));
  });

  it("allows cold-start member when location context favors them", () => {
    const locked = [member("A"), member("B")];
    const cold = member("NEW", { locationBucket: "VERY_CLOSE", serviceWorkdayCount: 0 });
    const far = member("FAR", { locationBucket: "FAR", serviceWorkdayCount: 0 });
    const pairMap = buildTeamPairMap([edge("A", "B", 5)]);

    const result = composeTeamGreedy(
      {
        teamSize: 3,
        lockedIds: ["A", "B"],
        candidates: [cold, far],
        pairMap,
        serviceContextAvailable: true,
        locationContextAvailable: true,
      },
      new Map(locked.map((m) => [m.employeeId, m])),
    );

    assert.ok(result.memberIds.includes("NEW"));
  });

  it("keeps locked members in every team", () => {
    const candidates = ["A", "B", "C", "D", "E"].map((id) => member(id));
    const pairMap = buildTeamPairMap([
      edge("A", "B", 8),
      edge("A", "C", 7),
      edge("B", "C", 6),
      edge("D", "E", 20),
    ]);

    const alts = composeTeamAlternatives(
      {
        teamSize: 3,
        lockedIds: ["A"],
        candidates: candidates.filter((c) => c.employeeId !== "A"),
        pairMap,
        serviceContextAvailable: false,
        locationContextAvailable: false,
        alternatives: 2,
        immutableIds: ["A"],
      },
      new Map([["A", member("A")]]),
    );

    assert.ok(alts.length >= 1);
    for (const alt of alts) {
      assert.ok(alt.memberIds.includes("A"));
    }
  });

  it("is deterministic for identical inputs", () => {
    const candidates = ["A", "B", "C", "D"].map((id) => member(id));
    const pairMap = buildTeamPairMap([
      edge("A", "B", 5),
      edge("A", "C", 5),
      edge("B", "C", 5),
      edge("A", "D", 4),
    ]);
    const input = {
      teamSize: 3,
      lockedIds: [] as string[],
      candidates,
      pairMap,
      serviceContextAvailable: false,
      locationContextAvailable: false,
    };
    const first = composeTeamGreedy(input, new Map());
    const second = composeTeamGreedy(input, new Map());
    assert.deepEqual(first.memberIds.slice().sort(), second.memberIds.slice().sort());
    assert.equal(first.breakdown.score, second.breakdown.score);
  });

  it("returns distinct deterministic alternatives", () => {
    const candidates = ["A", "B", "C", "D", "E", "F"].map((id) => member(id));
    const pairMap = buildTeamPairMap([
      edge("A", "B", 10),
      edge("A", "C", 9),
      edge("B", "C", 8),
      edge("A", "D", 7),
      edge("B", "D", 6),
      edge("C", "D", 5),
      edge("A", "E", 4),
      edge("B", "E", 3),
      edge("D", "F", 2),
    ]);

    const alts = composeTeamAlternatives(
      {
        teamSize: 3,
        lockedIds: [],
        candidates,
        pairMap,
        serviceContextAvailable: false,
        locationContextAvailable: false,
        alternatives: 3,
        immutableIds: [],
      },
      new Map(),
    );

    assert.ok(alts.length >= 2);
    const signatures = alts.map((alt) => [...alt.memberIds].sort().join(","));
    assert.equal(new Set(signatures).size, signatures.length);

    const again = composeTeamAlternatives(
      {
        teamSize: 3,
        lockedIds: [],
        candidates,
        pairMap,
        serviceContextAvailable: false,
        locationContextAvailable: false,
        alternatives: 3,
        immutableIds: [],
      },
      new Map(),
    );
    assert.deepEqual(
      again.map((alt) => [...alt.memberIds].sort().join(",")),
      signatures,
    );
  });

  it("builds team-level reasons without inventing quality claims", () => {
    const features = new Map([
      ["A", member("A", { serviceWorkdayCount: 3, locationBucket: "CLOSE" })],
      ["B", member("B", { serviceWorkdayCount: 2, locationBucket: "VERY_CLOSE" })],
      ["C", member("C", { serviceWorkdayCount: 0, locationBucket: "FAR" })],
    ]);
    const pairMap = buildTeamPairMap([edge("A", "B", 6), edge("A", "C", 2)]);
    const breakdown = scoreTeam(["A", "B", "C"], features, pairMap, {
      serviceContextAvailable: true,
      locationContextAvailable: true,
    });
    const reasons = buildTeamReasons(breakdown, 3);
    assert.ok(reasons.some((r) => r.code === "TEAM_HISTORY_COVERAGE"));
    assert.ok(reasons.some((r) => r.code === "TEAM_SERVICE_EXPERIENCE"));
    assert.ok(reasons.some((r) => r.code === "TEAM_LOCATION_PROXIMITY"));
    assert.ok(breakdown.score >= 0 && breakdown.score <= 1);
  });
});
