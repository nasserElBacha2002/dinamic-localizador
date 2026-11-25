import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildReplacementManualLinkDedupKey,
  buildVacancyCoveragePrimaryDedupKey,
} from "./replacement-dedup-keys";

describe("replacement dedup keys", () => {
  const workdayId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const requestId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("uses one primary key per workday version regardless of alert channel", () => {
    const v1 = buildVacancyCoveragePrimaryDedupKey(workdayId, 1);
    const v2 = buildVacancyCoveragePrimaryDedupKey(workdayId, 2);
    assert.notEqual(v1, v2);
    assert.match(v1, new RegExp(workdayId, "i"));
    assert.match(v1, /:v1$/);
  });

  it("scopes manual follow-up to request version", () => {
    const link1 = buildReplacementManualLinkDedupKey(requestId, 1);
    const link2 = buildReplacementManualLinkDedupKey(requestId, 2);
    assert.notEqual(link1, link2);
  });
});