import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../errors/app-error";
import { assertActiveTransactionForMutation } from "./sql-transaction-state";

describe("sql-transaction-state", () => {
  it("allows mutation only when XACT_STATE is 1", () => {
    assert.doesNotThrow(() => assertActiveTransactionForMutation(1));
  });

  it("rejects XACT_STATE 0", () => {
    assert.throws(
      () => assertActiveTransactionForMutation(0),
      (error: unknown) =>
        error instanceof AppError && error.code === "SQL_TRANSACTION_UNUSABLE",
    );
  });

  it("rejects XACT_STATE -1", () => {
    assert.throws(
      () => assertActiveTransactionForMutation(-1),
      (error: unknown) =>
        error instanceof AppError && error.code === "SQL_TRANSACTION_UNUSABLE",
    );
  });
});