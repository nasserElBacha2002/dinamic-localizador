import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterValidUuids,
  mergeSingularAndList,
  parseIdList,
  serializeIdList,
} from "./multi-value-filter";

describe("multi-value-filter", () => {
  it("parses comma-separated ids and drops duplicates", () => {
    assert.deepEqual(parseIdList("a,b, a,c"), ["a", "b", "c"]);
  });

  it("parses repeated array values", () => {
    assert.deepEqual(parseIdList(["a,b", "b", "c"]), ["a", "b", "c"]);
  });

  it("serializes unique ids", () => {
    assert.equal(serializeIdList(["a", "b", "a"]), "a,b");
    assert.equal(serializeIdList([]), undefined);
  });

  it("merges singular after plural without dropping either", () => {
    assert.deepEqual(mergeSingularAndList("solo", []), ["solo"]);
    assert.deepEqual(mergeSingularAndList("legacy", ["a", "b"]), ["a", "b", "legacy"]);
    assert.deepEqual(mergeSingularAndList("a", ["a", "b"]), ["a", "b"]);
  });

  it("filters valid UUIDs", () => {
    assert.deepEqual(
      filterValidUuids([
        "11111111-1111-4111-8111-111111111111",
        "not-a-uuid",
        "11111111-1111-4111-8111-111111111111",
      ]),
      ["11111111-1111-4111-8111-111111111111"],
    );
  });
});
