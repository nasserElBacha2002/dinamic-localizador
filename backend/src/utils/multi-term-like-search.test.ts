import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGroupAndLikeClause,
  buildMultiTermLikeSearchClause,
  mergeEmployeeLookupGroups,
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

describe("buildGroupAndLikeClause", () => {
  it("keeps the historical single-term predicate shape", () => {
    assert.deepEqual(buildGroupAndLikeClause("e.name", ["agustin"], "search"), {
      clause: "e.name LIKE @search",
      params: [{ name: "search", value: "%agustin%" }],
    });
  });

  it("ANDs multiple tokens for the same person", () => {
    assert.deepEqual(buildGroupAndLikeClause("e.name", ["juana", "diaz"], "search3"), {
      clause: "(e.name LIKE @search30 AND e.name LIKE @search31)",
      params: [
        { name: "search30", value: "%juana%" },
        { name: "search31", value: "%diaz%" },
      ],
    });
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

describe("mergeEmployeeLookupGroups", () => {
  it("returns a single-group page unchanged aside from stable name sort", () => {
    const merged = mergeEmployeeLookupGroups([
      [
        { id: "2", fullName: "Beatriz" },
        { id: "1", fullName: "Agustin" },
      ],
    ]);
    assert.deepEqual(merged, [
      { id: "1", fullName: "Agustin", matchedGroupIndex: 0 },
      { id: "2", fullName: "Beatriz", matchedGroupIndex: 0 },
    ]);
  });

  it("keeps later groups when the first group already fills the per-group limit", () => {
    // Simulates TOP(10) for "agustin" (10 rows) plus TOP pages for other people.
    const agustines = Array.from({ length: 10 }, (_, index) => ({
      id: `agustin-${index}`,
      fullName: `Agustin ${String(index).padStart(2, "0")}`,
    }));
    const ana = { id: "ana-1", fullName: "Ana Lopez" };
    const marta = { id: "marta-1", fullName: "Marta Gomez" };
    const juana = { id: "juana-1", fullName: "Juana Diaz" };

    const merged = mergeEmployeeLookupGroups([agustines, [ana], [marta], [juana]]);
    const ids = merged.map((row) => row.id);

    assert.equal(agustines.length, 10);
    assert.ok(ids.includes("ana-1"));
    assert.ok(ids.includes("marta-1"));
    assert.ok(ids.includes("juana-1"));
    assert.equal(ids.filter((id) => id.startsWith("agustin-")).length, 10);
    assert.equal(merged.length, 13);
    assert.equal(merged.find((row) => row.id === "ana-1")?.matchedGroupIndex, 1);
    assert.equal(merged.find((row) => row.id === "juana-1")?.matchedGroupIndex, 3);
  });

  it("deduplicates employees that match more than one independent search", () => {
    const shared = { id: "ana-1", fullName: "Ana Lopez" };
    const merged = mergeEmployeeLookupGroups([
      [shared, { id: "ana-2", fullName: "Ana Maria" }],
      [shared, { id: "lopez-1", fullName: "Lopez Pedro" }],
    ]);

    assert.equal(merged.filter((row) => row.id === "ana-1").length, 1);
    assert.equal(merged.find((row) => row.id === "ana-1")?.matchedGroupIndex, 0);
    assert.deepEqual(
      merged.map((row) => row.id).sort(),
      ["ana-1", "ana-2", "lopez-1"],
    );
  });

  it("keeps the first group's index when the same person appears in two groups", () => {
    const anaLopez = { id: "1", fullName: "Ana Lopez" };
    const merged = mergeEmployeeLookupGroups([[anaLopez], [anaLopez]]);
    assert.deepEqual(merged, [
      { id: "1", fullName: "Ana Lopez", matchedGroupIndex: 0 },
    ]);
  });
});
