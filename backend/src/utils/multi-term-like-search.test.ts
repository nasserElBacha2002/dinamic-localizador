import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMultiTermLikeSearchClause,
  parseLookupSearchGroups,
  splitSearchTerms,
} from "./multi-term-like-search";

describe("splitSearchTerms", () => {
  it("keeps a single term unchanged", () => {
    assert.deepEqual(splitSearchTerms("agustin"), ["agustin"]);
  });

  it("splits whitespace within one person group", () => {
    assert.deepEqual(splitSearchTerms("agustin perez"), ["agustin", "perez"]);
  });

  it("ignores repeated spaces and empty tokens", () => {
    assert.deepEqual(splitSearchTerms("  agustin   perez  "), ["agustin", "perez"]);
    assert.deepEqual(splitSearchTerms("   "), []);
    assert.deepEqual(splitSearchTerms(""), []);
  });
});

describe("parseLookupSearchGroups", () => {
  it("treats a space-separated input as one AND group", () => {
    assert.deepEqual(parseLookupSearchGroups("agustin perez"), [["agustin", "perez"]]);
  });

  it("splits independent searches on commas", () => {
    assert.deepEqual(parseLookupSearchGroups("agustin perez, ana lopez, marta gomez"), [
      ["agustin", "perez"],
      ["ana", "lopez"],
      ["marta", "gomez"],
    ]);
  });

  it("normalizes spaces around commas, consecutive commas, and empty groups", () => {
    assert.deepEqual(parseLookupSearchGroups("  agustin perez ,  , ana lopez,  ,"), [
      ["agustin", "perez"],
      ["ana", "lopez"],
    ]);
  });
});

describe("buildMultiTermLikeSearchClause", () => {
  it("matches the historical single-term name LIKE predicate", () => {
    const result = buildMultiTermLikeSearchClause("e.name", "agustin");
    assert.equal(result.clause, "e.name LIKE @search");
    assert.deepEqual(result.params, [{ name: "search", value: "%agustin%" }]);
  });

  it("uses AND for space-separated terms of the same person", () => {
    const result = buildMultiTermLikeSearchClause("e.name", "agustin perez");
    assert.equal(
      result.clause,
      "(e.name LIKE @search0 AND e.name LIKE @search1)",
    );
    assert.deepEqual(result.params, [
      { name: "search0", value: "%agustin%" },
      { name: "search1", value: "%perez%" },
    ]);
  });

  it("unions comma-separated independent searches with OR", () => {
    const result = buildMultiTermLikeSearchClause(
      "e.name",
      "agustin perez, ana lopez, marta gomez",
    );
    assert.equal(
      result.clause,
      "((e.name LIKE @search0 AND e.name LIKE @search1) OR (e.name LIKE @search2 AND e.name LIKE @search3) OR (e.name LIKE @search4 AND e.name LIKE @search5))",
    );
    assert.deepEqual(result.params, [
      { name: "search0", value: "%agustin%" },
      { name: "search1", value: "%perez%" },
      { name: "search2", value: "%ana%" },
      { name: "search3", value: "%lopez%" },
      { name: "search4", value: "%marta%" },
      { name: "search5", value: "%gomez%" },
    ]);
  });

  it("ignores repeated spaces, spaces around commas, and empty comma groups", () => {
    const result = buildMultiTermLikeSearchClause(
      "e.name",
      "  agustin   perez ,  , ana  lopez,,",
    );
    assert.equal(
      result.clause,
      "((e.name LIKE @search0 AND e.name LIKE @search1) OR (e.name LIKE @search2 AND e.name LIKE @search3))",
    );
    assert.deepEqual(result.params, [
      { name: "search0", value: "%agustin%" },
      { name: "search1", value: "%perez%" },
      { name: "search2", value: "%ana%" },
      { name: "search3", value: "%lopez%" },
    ]);
  });

  it("allows overlapping group matches without inventing a full-string literal", () => {
    // A person matching more than one group still appears once in SQL results.
    const result = buildMultiTermLikeSearchClause("e.name", "ana lopez, ana");
    assert.equal(
      result.clause,
      "((e.name LIKE @search0 AND e.name LIKE @search1) OR e.name LIKE @search2)",
    );
    assert.deepEqual(result.params, [
      { name: "search0", value: "%ana%" },
      { name: "search1", value: "%lopez%" },
      { name: "search2", value: "%ana%" },
    ]);
    assert.equal(
      result.params.some((param) => param.value.includes("ana lopez")),
      false,
    );
  });

  it("returns a null clause for whitespace-only or comma-only search", () => {
    assert.deepEqual(buildMultiTermLikeSearchClause("e.name", "   "), {
      clause: null,
      params: [],
    });
    assert.deepEqual(buildMultiTermLikeSearchClause("e.name", " , , "), {
      clause: null,
      params: [],
    });
  });
});
