import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("CascadingFilterSelect", () => {
  const source = readFileSync(
    join(process.cwd(), "src/design-system/filters/CascadingFilterSelect.tsx"),
    "utf8",
  );

  it("clears child atomically via a single onParentChange call", () => {
    assert.match(source, /onParentChange\(nextParent, ""\)/);
    assert.doesNotMatch(source, /onParentChange\(nextParent\);\s*if/);
  });

  it("disables child until parent is selected", () => {
    assert.match(source, /disabled \|\| !parentValue/);
  });
});
