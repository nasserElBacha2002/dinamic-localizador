import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computePreselectScore,
  preselectCandidateIds,
} from "./candidate-preselection";
import type { TeamMemberFeatures } from "./team-scorer";

const features = (id: string, overrides: Partial<TeamMemberFeatures> = {}): TeamMemberFeatures => ({
  employeeId: id,
  serviceWorkdayCount: 0,
  locationBucket: "UNKNOWN",
  ...overrides,
});

describe("candidate-preselection", () => {
  it("keeps high-connectivity candidates over lexical fillers", () => {
    const fillers = Array.from({ length: 90 }, (_, i) => ({
      features: features(`aaa-${String(i).padStart(3, "0")}`, {
        locationBucket: "CLOSE",
        serviceWorkdayCount: 2,
      }),
      connectivity: null,
      affinityToFixed: 0,
    }));
    const cluster = ["zzz-x", "zzz-y", "zzz-z"].map((id) => ({
      features: features(id, { locationBucket: "FAR", serviceWorkdayCount: 0 }),
      connectivity: {
        employeeId: id,
        relatedEmployeeCount: 2,
        weightedSharedOccurrences: 25,
        strongConnectionCount: 2,
        recentConnectionCount: 2,
      },
      affinityToFixed: 0,
    }));

    const selected = preselectCandidateIds([...fillers, ...cluster], {
      serviceContextAvailable: true,
      locationContextAvailable: true,
      pruneLimit: 80,
    });

    assert.ok(selected.includes("zzz-x"));
    assert.ok(selected.includes("zzz-y"));
    assert.ok(selected.includes("zzz-z"));
    assert.equal(selected.length, 80);
  });

  it("is deterministic", () => {
    const candidates = ["b", "a", "c"].map((id) => ({
      features: features(id),
      connectivity: {
        employeeId: id,
        relatedEmployeeCount: 1,
        weightedSharedOccurrences: 3,
        strongConnectionCount: 0,
        recentConnectionCount: 0,
      },
      affinityToFixed: 0,
    }));
    const left = preselectCandidateIds(candidates, {
      serviceContextAvailable: false,
      locationContextAvailable: false,
      pruneLimit: 2,
    });
    const right = preselectCandidateIds(candidates, {
      serviceContextAvailable: false,
      locationContextAvailable: false,
      pruneLimit: 2,
    });
    assert.deepEqual(left, right);
    assert.ok(computePreselectScore(candidates[0]!, {
      serviceContextAvailable: false,
      locationContextAvailable: false,
    }) >= 0);
  });
});
