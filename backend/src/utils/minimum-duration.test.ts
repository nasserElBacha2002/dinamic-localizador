import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withMinimumDuration } from "./minimum-duration";

describe("withMinimumDuration", () => {
  it("pads a fast operation to minMs without jitter", async () => {
    let waited = 0;
    let clock = 1_000;
    const result = await withMinimumDuration(async () => "ok", {
      minMs: 40,
      jitterMs: 0,
      now: () => clock,
      wait: async (ms) => {
        waited = ms;
        clock += ms;
      },
    });
    assert.equal(result, "ok");
    assert.equal(waited, 40);
  });

  it("does not wait when the operation already exceeded minMs", async () => {
    let waited = 0;
    let clock = 0;
    await withMinimumDuration(
      async () => {
        clock += 80;
      },
      {
        minMs: 40,
        jitterMs: 0,
        now: () => clock,
        wait: async (ms) => {
          waited = ms;
        },
      },
    );
    assert.equal(waited, 0);
  });
});
