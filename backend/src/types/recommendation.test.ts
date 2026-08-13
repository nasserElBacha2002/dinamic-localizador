import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RECOMMENDATION_REASON_CODES,
  WORKFORCE_RECOMMENDATION_ALGORITHM_VERSION,
  type RecommendationReason,
} from "./recommendation";

/** Mirror of frontend taxonomy — keep both files aligned deliberately. */
const FRONTEND_CONTRACT_MIRROR = {
  algorithmVersion: "workforce-recommendation-v1",
  reasonCodes: [
    "TEAM_AFFINITY",
    "LOCATION_PROXIMITY",
    "SERVICE_EXPERIENCE",
    "OPERATION_TYPE_EXPERIENCE",
    "RECENT_COLLABORATION",
  ],
} as const;

describe("recommendation contracts (phase 0)", () => {
  it("exposes algorithm version and reason taxonomy without engine logic", () => {
    assert.equal(WORKFORCE_RECOMMENDATION_ALGORITHM_VERSION, "workforce-recommendation-v1");
    assert.ok(RECOMMENDATION_REASON_CODES.includes("LOCATION_PROXIMITY"));
    assert.ok(RECOMMENDATION_REASON_CODES.includes("TEAM_AFFINITY"));

    const reason: RecommendationReason = {
      code: "TEAM_AFFINITY",
      params: { timesWorkedTogether: 14 },
    };
    assert.equal(reason.code, "TEAM_AFFINITY");
    assert.equal(reason.params?.timesWorkedTogether, 14);
  });

  it("stays contractually aligned with frontend mirror constants", () => {
    assert.equal(
      WORKFORCE_RECOMMENDATION_ALGORITHM_VERSION,
      FRONTEND_CONTRACT_MIRROR.algorithmVersion,
    );
    assert.deepEqual([...RECOMMENDATION_REASON_CODES], [...FRONTEND_CONTRACT_MIRROR.reasonCodes]);
  });
});
