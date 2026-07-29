import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getDuplicateKeyConstraint, isDuplicateKeyError } from "./sql-server-errors";

describe("sql-server-errors", () => {
  it("detects duplicate key numbers", () => {
    assert.equal(isDuplicateKeyError({ number: 2627 }), true);
    assert.equal(isDuplicateKeyError({ number: 2601 }), true);
    assert.equal(isDuplicateKeyError({ number: 50000 }), false);
  });

  it("extracts unique index names from messages", () => {
    const error = {
      number: 2601,
      message:
        "Cannot insert duplicate key row in object 'dbo.companies' with unique index 'UQ_companies_name'.",
    };
    assert.equal(getDuplicateKeyConstraint(error), "UQ_companies_name");
  });
});
