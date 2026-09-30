import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalizeLookupSearch,
  consumeLookupSearchGroupForSelection,
  formatLookupSearchGroups,
  parseLookupSearchGroups,
} from "./consume-lookup-search-group";

describe("parseLookupSearchGroups / formatLookupSearchGroups", () => {
  it("normalizes repeated spaces, comma padding, and empty groups", () => {
    assert.deepEqual(parseLookupSearchGroups("  isaac  ,  , cintia , emp,, "), [
      ["isaac"],
      ["cintia"],
      ["emp"],
    ]);
    assert.equal(
      formatLookupSearchGroups([
        ["isaac"],
        ["cintia"],
        ["juana", "diaz"],
      ]),
      "isaac, cintia, juana diaz",
    );
  });
});

describe("consumeLookupSearchGroupForSelection", () => {
  it("clears a single-group search when that group index is consumed", () => {
    assert.equal(
      consumeLookupSearchGroupForSelection("cintia", {
        groupIndex: 0,
        groupKey: "cintia",
        sourceSearch: "cintia",
      }),
      "",
    );
  });

  it("removes only the middle group by index on the same search snapshot", () => {
    assert.equal(
      consumeLookupSearchGroupForSelection("isaac, cintia, emp", {
        groupIndex: 1,
        groupKey: "cintia",
        sourceSearch: "isaac, cintia, emp",
      }),
      "isaac, emp",
    );
  });

  it("supports successive selections when each option belongs to the current snapshot", () => {
    const afterCintia = consumeLookupSearchGroupForSelection("isaac, cintia, emp", {
      groupIndex: 1,
      groupKey: "cintia",
      sourceSearch: "isaac, cintia, emp",
    });
    assert.equal(afterCintia, "isaac, emp");

    const afterIsaac = consumeLookupSearchGroupForSelection(afterCintia, {
      groupIndex: 0,
      groupKey: "isaac",
      sourceSearch: "isaac, emp",
    });
    assert.equal(afterIsaac, "emp");

    const afterEmp = consumeLookupSearchGroupForSelection(afterIsaac, {
      groupIndex: 0,
      groupKey: "emp",
      sourceSearch: "emp",
    });
    assert.equal(afterEmp, "");
  });

  it("consumes a multi-token AND group by index without touching neighbors", () => {
    assert.equal(
      consumeLookupSearchGroupForSelection("juana diaz, cintia, isaac", {
        groupIndex: 0,
        groupKey: "juana diaz",
        sourceSearch: "juana diaz, cintia, isaac",
      }),
      "cintia, isaac",
    );
  });

  it("uses the stamped origin index when a person could match two groups", () => {
    assert.equal(
      consumeLookupSearchGroupForSelection("ana, ana lopez", {
        groupIndex: 0,
        groupKey: "ana",
        sourceSearch: "ana, ana lopez",
      }),
      "ana lopez",
    );
    assert.equal(
      consumeLookupSearchGroupForSelection("ana, ana lopez", {
        groupIndex: 1,
        groupKey: "ana lopez",
        sourceSearch: "ana, ana lopez",
      }),
      "ana",
    );
  });

  it("does not use a stale index from a previous search snapshot", () => {
    // Options from "ana, marta, juana": Marta was index 1.
    // After consuming Ana, current search is "marta, juana" (Marta=0, Juana=1).
    // Stale Marta option still carries index 1 + key "marta".
    const remaining = consumeLookupSearchGroupForSelection("marta, juana", {
      groupIndex: 1,
      groupKey: "marta",
      sourceSearch: "ana, marta, juana",
    });
    assert.equal(remaining, "juana");
    assert.doesNotMatch(remaining, /marta/);
    assert.match(remaining, /juana/);
  });

  it("preserves pending searches when a stale index is out of range and key is missing", () => {
    assert.equal(
      consumeLookupSearchGroupForSelection("marta, juana", {
        groupIndex: 2,
        sourceSearch: "ana, marta, juana",
      }),
      "marta, juana",
    );
  });

  it("preserves pending searches when the association is missing or ambiguous", () => {
    assert.equal(
      consumeLookupSearchGroupForSelection("isaac, cintia, emp", undefined),
      "isaac, cintia, emp",
    );
    assert.equal(
      consumeLookupSearchGroupForSelection("isaac, cintia, emp", null),
      "isaac, cintia, emp",
    );
    // Duplicate keys without a same-snapshot index → do not guess.
    assert.equal(
      consumeLookupSearchGroupForSelection("ana, ana", {
        groupKey: "ana",
        sourceSearch: "other search",
      }),
      "ana, ana",
    );
  });

  it("treats equivalent formatting as the same snapshot for index consumption", () => {
    assert.equal(
      canonicalizeLookupSearch("  ana , marta , juana "),
      "ana, marta, juana",
    );
    assert.equal(
      consumeLookupSearchGroupForSelection("ana, marta, juana", {
        groupIndex: 0,
        groupKey: "ana",
        sourceSearch: "  ana , marta , juana ",
      }),
      "marta, juana",
    );
  });
});
