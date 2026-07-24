import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";
import { BREAKPOINTS } from "./breakpoints";
import breakpointsJson from "./breakpoints.json" with { type: "json" };

const require = createRequire(import.meta.url);

describe("breakpoints source of truth", () => {
  it("keeps TypeScript BREAKPOINTS aligned with shared JSON", () => {
    assert.deepEqual(BREAKPOINTS, breakpointsJson);
    assert.equal(BREAKPOINTS.sm, "48em");
    assert.equal(BREAKPOINTS.md, "62em");
  });

  it("keeps PostCSS config variables aligned with shared JSON", () => {
    const postcss = require("../../../postcss.config.cjs") as {
      plugins: { "postcss-simple-vars": { variables: Record<string, string> } };
    };
    const vars = postcss.plugins["postcss-simple-vars"].variables;
    assert.equal(vars["mantine-breakpoint-sm"], breakpointsJson.sm);
    assert.equal(vars["mantine-breakpoint-md"], breakpointsJson.md);
  });
});
