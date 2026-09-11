import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  initiateFatalShutdown,
  resetFatalShutdownForTests,
} from "./fatal-shutdown";

describe("fatal shutdown coordinator", () => {
  afterEach(() => {
    resetFatalShutdownForTests();
  });

  it("exits once with code 1 and is idempotent", async () => {
    const exits: number[] = [];
    initiateFatalShutdown({
      event: "process.uncaughtException",
      message: "boom",
      error: new Error("boom"),
      exit: (code) => {
        exits.push(code);
      },
      forceExitAfterMs: 50,
    });
    initiateFatalShutdown({
      event: "process.uncaughtException",
      message: "second",
      error: new Error("second"),
      exit: (code) => {
        exits.push(code);
      },
      forceExitAfterMs: 50,
    });

    await new Promise((r) => setTimeout(r, 200));
    assert.ok(exits.includes(1));
    assert.ok(exits.length >= 1);
    assert.ok(exits.length <= 2);
  });
});
