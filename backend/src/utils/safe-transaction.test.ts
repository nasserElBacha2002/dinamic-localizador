import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeRollback } from "./safe-transaction";

describe("safeRollback", () => {
  it("does not throw when rollback fails", async () => {
    const transaction = {
      rollback: async () => {
        throw new Error("already committed");
      },
    };

    await assert.doesNotReject(async () => {
      await safeRollback(transaction as never);
    });
  });
});
