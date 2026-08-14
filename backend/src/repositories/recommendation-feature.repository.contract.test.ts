import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";
import { WORKFORCE_RECOMMENDATION_V1_RECENCY } from "../constants/workforce-recommendation-v1";

describe("recommendation-feature.repository SQL contracts", () => {
  const source = readFileSync(
    join(__dirname, "recommendation-feature.repository.ts"),
    "utf8",
  );

  it("uses OPENJSON for candidate/assigned id sets (no per-id SQL params)", () => {
    assert.match(source, /OPENJSON\(@assignedIdsJson\)/);
    assert.match(source, /OPENJSON\(@excludedIdsJson\)/);
    assert.doesNotMatch(source, /@cand\d/);
    assert.doesNotMatch(source, /bindUuidList/);
  });

  it("receives recency thresholds from V1 config params", () => {
    assert.match(source, /@recentDays/);
    assert.match(source, /@midDays/);
    assert.match(source, /WORKFORCE_RECOMMENDATION_V1_RECENCY/);
    assert.equal(WORKFORCE_RECOMMENDATION_V1_RECENCY.recentDays, 90);
    assert.equal(WORKFORCE_RECOMMENDATION_V1_RECENCY.midDays, 365);
    assert.doesNotMatch(source, /<= 90/);
    assert.doesNotMatch(source, /BETWEEN 91 AND 365/);
  });

  it("filters historical features with historyCutoffDate", () => {
    assert.match(source, /@historyCutoffDate/);
    assert.match(source, /ow\.work_date < @historyCutoffDate/);
  });
});
