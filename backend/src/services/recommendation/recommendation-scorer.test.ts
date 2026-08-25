import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRecommendationReasons,
  combineRecommendationScore,
  compareScoredCandidates,
  computeServiceExperience,
  computeTeamAffinity,
  distanceMetersBetween,
  resolveLocationProximityBucket,
  scoreCandidateFeatures,
  type AffinityPairStats,
  type ScoredCandidateFeatures,
} from "./recommendation-scorer";
import { WORKFORCE_RECOMMENDATION_ALGORITHM_VERSION } from "../../types/recommendation";

const pair = (overrides: Partial<AffinityPairStats> = {}): AffinityPairStats => ({
  assignedEmployeeId: "asg-1",
  sharedOccurrences: 0,
  lastSharedAt: null,
  recent90: 0,
  mid365: 0,
  older: 0,
  ...overrides,
});

describe("recommendation-scorer V1", () => {
  it("treats teamAffinity as unavailable when assignedCount is 0", () => {
    const affinity = computeTeamAffinity(0, []);
    assert.equal(affinity.teamAffinity, null);

    const scored = scoreCandidateFeatures({
      employeeId: "solo",
      assignedCount: 0,
      affinityPairs: [],
      serviceWorkdayCount: 5,
      locationBucket: "VERY_CLOSE",
    });
    assert.equal(scored.teamAffinity, null);
    assert.equal(scored.score, 1);
  });

  it("keeps teamAffinity at 0 when teammates exist but history is empty", () => {
    const scored = scoreCandidateFeatures({
      employeeId: "cold",
      assignedCount: 2,
      affinityPairs: [],
      serviceWorkdayCount: 5,
      locationBucket: "VERY_CLOSE",
    });
    assert.equal(scored.teamAffinity, 0);
    assert.ok(scored.score < 1);
    assert.equal(scored.score, 0.55);
  });

  it("scores 1 with only service experience when team and location are unavailable", () => {
    const score = combineRecommendationScore({
      teamAffinity: null,
      serviceExperience: 1,
      locationProximity: null,
    });
    assert.equal(score, 1);
  });

  it("returns 0 when no active feature parts remain", () => {
    assert.equal(
      combineRecommendationScore({
        teamAffinity: null,
        serviceExperience: 0,
        locationProximity: null,
      }),
      0,
    );
  });

  it("ranks higher team affinity above equal peers", () => {
    const high = scoreCandidateFeatures({
      employeeId: "b",
      assignedCount: 1,
      affinityPairs: [pair({ sharedOccurrences: 6, recent90: 6, lastSharedAt: "2026-07-01" })],
      serviceWorkdayCount: 0,
      locationBucket: "UNKNOWN",
    });
    const low = scoreCandidateFeatures({
      employeeId: "c",
      assignedCount: 1,
      affinityPairs: [pair({ sharedOccurrences: 1, recent90: 1, lastSharedAt: "2026-07-01" })],
      serviceWorkdayCount: 0,
      locationBucket: "UNKNOWN",
    });
    assert.ok(high.score > low.score);
    assert.equal(compareScoredCandidates(high, low) < 0, true);
  });

  it("prefers CLOSE over FAR when other features match", () => {
    const close = scoreCandidateFeatures({
      employeeId: "b",
      assignedCount: 0,
      affinityPairs: [],
      serviceWorkdayCount: 0,
      locationBucket: "CLOSE",
    });
    const far = scoreCandidateFeatures({
      employeeId: "c",
      assignedCount: 0,
      affinityPairs: [],
      serviceWorkdayCount: 0,
      locationBucket: "FAR",
    });
    assert.ok(close.score > far.score);
  });

  it("does not invent location reasons when location is UNKNOWN", () => {
    const scored = scoreCandidateFeatures({
      employeeId: "cold",
      assignedCount: 0,
      affinityPairs: [],
      serviceWorkdayCount: 2,
      locationBucket: "UNKNOWN",
    });
    assert.ok(scored.score > 0);
    assert.equal(scored.locationProximity, null);
    const reasons = buildRecommendationReasons(scored);
    assert.equal(
      reasons.some((reason) => reason.code === "LOCATION_PROXIMITY"),
      false,
    );
    assert.equal(
      reasons.some((reason) => reason.code === "SERVICE_EXPERIENCE"),
      true,
    );
    const serviceReason = reasons.find((reason) => reason.code === "SERVICE_EXPERIENCE");
    assert.deepEqual(serviceReason?.params, { serviceWorkdays: 2 });
  });

  it("weights recent shared work higher than equally frequent old history", () => {
    const recent = computeTeamAffinity(1, [
      pair({ sharedOccurrences: 4, recent90: 4, lastSharedAt: "2026-07-01" }),
    ]);
    const old = computeTeamAffinity(1, [
      pair({ sharedOccurrences: 4, older: 4, lastSharedAt: "2020-01-01" }),
    ]);
    assert.ok(recent.teamAffinity !== null && old.teamAffinity !== null);
    assert.ok(recent.teamAffinity > old.teamAffinity);
  });

  it("is deterministic for identical inputs and tie-breaks by employeeId", () => {
    const input = {
      employeeId: "emp-1",
      assignedCount: 2,
      affinityPairs: [
        pair({
          assignedEmployeeId: "a",
          sharedOccurrences: 3,
          recent90: 2,
          mid365: 1,
          lastSharedAt: "2026-06-01",
        }),
        pair({
          assignedEmployeeId: "b",
          sharedOccurrences: 1,
          recent90: 1,
          lastSharedAt: "2026-07-01",
        }),
      ],
      serviceWorkdayCount: 4,
      locationBucket: "MEDIUM" as const,
    };
    const first = scoreCandidateFeatures(input);
    const second = scoreCandidateFeatures(input);
    assert.deepEqual(first, second);

    const peers: ScoredCandidateFeatures[] = [
      scoreCandidateFeatures({ ...input, employeeId: "z" }),
      scoreCandidateFeatures({ ...input, employeeId: "a" }),
      scoreCandidateFeatures({ ...input, employeeId: "m" }),
    ];
    const rankedOnce = [...peers].sort(compareScoredCandidates).map((item) => item.employeeId);
    const rankedTwice = [...peers].sort(compareScoredCandidates).map((item) => item.employeeId);
    assert.deepEqual(rankedOnce, rankedTwice);
    assert.deepEqual(rankedOnce, ["a", "m", "z"]);
  });

  it("keeps cold-start employees eligible via other signals", () => {
    const cold = scoreCandidateFeatures({
      employeeId: "new",
      assignedCount: 3,
      affinityPairs: [],
      serviceWorkdayCount: 0,
      locationBucket: "VERY_CLOSE",
    });
    assert.equal(cold.teamAffinity, 0);
    assert.ok(cold.score > 0);
    assert.equal(buildRecommendationReasons(cold)[0]?.code, "LOCATION_PROXIMITY");
  });

  it("emits TEAM_AFFINITY only when shared work exists", () => {
    const none = scoreCandidateFeatures({
      employeeId: "x",
      assignedCount: 2,
      affinityPairs: [],
      serviceWorkdayCount: 0,
      locationBucket: "UNKNOWN",
    });
    assert.deepEqual(buildRecommendationReasons(none), []);
  });

  it("maps proximity buckets from meters and same-zone", () => {
    assert.equal(resolveLocationProximityBucket(null), "UNKNOWN");
    assert.equal(resolveLocationProximityBucket(500), "VERY_CLOSE");
    assert.equal(resolveLocationProximityBucket(3_000), "CLOSE");
    assert.equal(resolveLocationProximityBucket(10_000), "MEDIUM");
    assert.equal(resolveLocationProximityBucket(40_000), "FAR");
    assert.equal(resolveLocationProximityBucket(null, true), "SAME_ZONE");
    assert.equal(resolveLocationProximityBucket(40_000, true), "SAME_ZONE");
  });

  it("scores SAME_ZONE and omits UNKNOWN without inventing distance", () => {
    const same = scoreCandidateFeatures({
      employeeId: "same",
      assignedCount: 0,
      affinityPairs: [],
      serviceWorkdayCount: 0,
      locationBucket: "SAME_ZONE",
    });
    const unknown = scoreCandidateFeatures({
      employeeId: "unk",
      assignedCount: 0,
      affinityPairs: [],
      serviceWorkdayCount: 0,
      locationBucket: "UNKNOWN",
    });
    assert.equal(same.locationProximity, 1);
    assert.equal(unknown.locationProximity, null);
    assert.ok(same.score > unknown.score);
  });

  it("saturates service experience", () => {
    assert.equal(computeServiceExperience(0), 0);
    assert.equal(computeServiceExperience(5), 1);
    assert.equal(computeServiceExperience(50), 1);
  });

  it("renormalizes score when location is omitted and team is zero", () => {
    const withLocation = combineRecommendationScore({
      teamAffinity: 0,
      serviceExperience: 1,
      locationProximity: 0,
    });
    const withoutLocation = combineRecommendationScore({
      teamAffinity: 0,
      serviceExperience: 1,
      locationProximity: null,
    });
    assert.ok(withoutLocation > withLocation);
    assert.equal(withoutLocation, 0.4);
  });

  it("Phase B: distanceMeters is explainability-only and does not change score or ranking", () => {
    const baseInputs = [
      {
        employeeId: "a",
        assignedCount: 0 as const,
        affinityPairs: [] as AffinityPairStats[],
        serviceWorkdayCount: 2,
        locationBucket: "CLOSE" as const,
      },
      {
        employeeId: "b",
        assignedCount: 0 as const,
        affinityPairs: [] as AffinityPairStats[],
        serviceWorkdayCount: 2,
        locationBucket: "FAR" as const,
      },
      {
        employeeId: "c",
        assignedCount: 0 as const,
        affinityPairs: [] as AffinityPairStats[],
        serviceWorkdayCount: 5,
        locationBucket: "SAME_ZONE" as const,
      },
    ];

    const before = baseInputs.map((input) => scoreCandidateFeatures(input));
    const after = baseInputs.map((input, index) =>
      scoreCandidateFeatures({
        ...input,
        distanceMeters: index === 2 ? null : 1000 + index * 5000,
      }),
    );

    assert.deepEqual(
      before.map((item) => ({
        employeeId: item.employeeId,
        score: item.score,
        locationBucket: item.locationBucket,
        locationProximity: item.locationProximity,
      })),
      after.map((item) => ({
        employeeId: item.employeeId,
        score: item.score,
        locationBucket: item.locationBucket,
        locationProximity: item.locationProximity,
      })),
    );

    const orderBefore = [...before].sort(compareScoredCandidates).map((item) => item.employeeId);
    const orderAfter = [...after].sort(compareScoredCandidates).map((item) => item.employeeId);
    assert.deepEqual(orderBefore, orderAfter);

    const closeReason = buildRecommendationReasons(after[0]!).find(
      (reason) => reason.code === "LOCATION_PROXIMITY",
    );
    assert.equal(closeReason?.params?.bucket, "CLOSE");
    assert.equal(closeReason?.params?.distanceMeters, 1000);

    const sameReason = buildRecommendationReasons(after[2]!).find(
      (reason) => reason.code === "LOCATION_PROXIMITY",
    );
    assert.equal(sameReason?.params?.bucket, "SAME_ZONE");
    assert.equal(sameReason?.params?.distanceMeters, null);
  });

  it("Phase C: canonicalization is metadata-only — identical centroids keep distance/bucket/score/ranking", () => {
    // Same Haversine inputs before/after taxonomy; locality aliases must not touch scoring.
    const distanceMeters = distanceMetersBetween(-34.62, -58.44, -34.6, -58.4);
    const bucket = resolveLocationProximityBucket(distanceMeters, false);
    const scored = scoreCandidateFeatures({
      employeeId: "phase-c",
      assignedCount: 0,
      affinityPairs: [],
      serviceWorkdayCount: 1,
      locationBucket: bucket,
      distanceMeters,
    });
    const again = scoreCandidateFeatures({
      employeeId: "phase-c",
      assignedCount: 0,
      affinityPairs: [],
      serviceWorkdayCount: 1,
      locationBucket: bucket,
      distanceMeters,
    });
    assert.equal(scored.score, again.score);
    assert.equal(scored.locationProximity, again.locationProximity);
    assert.equal(scored.locationBucket, again.locationBucket);
    assert.equal(scored.distanceMeters, again.distanceMeters);
    assert.equal(WORKFORCE_RECOMMENDATION_ALGORITHM_VERSION, "workforce-recommendation-v1");
  });

  it("emits LOCATION_PROXIMITY distanceMeters when distance exists and omits inventing for UNKNOWN", () => {
    const close = scoreCandidateFeatures({
      employeeId: "near",
      assignedCount: 0,
      affinityPairs: [],
      serviceWorkdayCount: 0,
      locationBucket: "CLOSE",
      distanceMeters: 2410.4,
    });
    const unknown = scoreCandidateFeatures({
      employeeId: "unk",
      assignedCount: 0,
      affinityPairs: [],
      serviceWorkdayCount: 0,
      locationBucket: "UNKNOWN",
      distanceMeters: null,
    });

    const closeReason = buildRecommendationReasons(close)[0];
    assert.equal(closeReason?.code, "LOCATION_PROXIMITY");
    assert.deepEqual(closeReason?.params, { bucket: "CLOSE", distanceMeters: 2410 });

    assert.deepEqual(buildRecommendationReasons(unknown), []);
  });
});
