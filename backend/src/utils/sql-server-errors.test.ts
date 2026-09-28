import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getDuplicateKeyConstraint,
  isDuplicateKeyError,
  isSqlDeadlockError,
  matchesDuplicateKeyConstraint,
} from "./sql-server-errors";

const duplicateWithIndex = (indexName: string, number = 2601) => ({
  number,
  message: `Cannot insert duplicate key row in object 'dbo.t' with unique index '${indexName}'.`,
});

const duplicateWithConstraint = (constraintName: string, number = 2627) =>
  Object.assign(new Error(`Violation of UNIQUE KEY constraint '${constraintName}'.`), { number });

describe("sql-server-errors", () => {
  it("detects duplicate key numbers", () => {
    assert.equal(isDuplicateKeyError({ number: 2627 }), true);
    assert.equal(isDuplicateKeyError({ number: 2601 }), true);
    assert.equal(isDuplicateKeyError({ number: 50000 }), false);
    assert.equal(isSqlDeadlockError({ number: 1205 }), true);
    assert.equal(isSqlDeadlockError({ originalError: { number: 1205 } }), true);
    assert.equal(isSqlDeadlockError({ number: 2627 }), false);
  });

  it("detects nested originalError.number for duplicates", () => {
    assert.equal(isDuplicateKeyError({ originalError: { number: 2627 } }), true);
    assert.equal(isDuplicateKeyError({ originalError: { number: 2601 } }), true);
    assert.equal(
      matchesDuplicateKeyConstraint(
        {
          originalError: {
            number: 2627,
            message: "Violation of UNIQUE KEY constraint 'UQ_nested'.",
          },
        },
        "UQ_nested",
      ),
      true,
    );
  });

  it("extracts unique index names from messages", () => {
    const error = duplicateWithIndex("UQ_companies_name");
    assert.equal(getDuplicateKeyConstraint(error), "UQ_companies_name");
  });

  it("matchesDuplicateKeyConstraint requires exact name (no prefix)", () => {
    const exact = duplicateWithIndex("UQ_test");
    assert.equal(matchesDuplicateKeyConstraint(exact, "UQ_test"), true);
    assert.equal(matchesDuplicateKeyConstraint(exact, "UQ_test_archived"), false);

    const overlapping = duplicateWithIndex("UQ_test_archived");
    assert.equal(matchesDuplicateKeyConstraint(overlapping, "UQ_test"), false);
    assert.equal(matchesDuplicateKeyConstraint(overlapping, "UQ_test_archived"), true);
  });

  it("matchesDuplicateKeyConstraint rejects non-duplicate errors that mention the name", () => {
    const nonDuplicate = new Error("Something about UQ_test");
    assert.equal(matchesDuplicateKeyConstraint(nonDuplicate, "UQ_test"), false);
  });

  it("fallback uses quoted identifier only when name cannot be parsed", () => {
    const opaque = {
      number: 2627,
      message: "Duplicate key (UQ_opaque_no_quotes) — see docs",
    };
    assert.equal(getDuplicateKeyConstraint(opaque), null);
    assert.equal(matchesDuplicateKeyConstraint(opaque, "UQ_opaque_no_quotes"), false);

    // Avoid phrases that getDuplicateKeyConstraint already parses (`unique index`, `constraint`, `duplicate key…'…'`).
    const quotedFallback = {
      number: 2627,
      message: "Driver blob name='UQ_quoted_only' (no standard SQL Server phrasing)",
    };
    assert.equal(getDuplicateKeyConstraint(quotedFallback), null);
    assert.equal(matchesDuplicateKeyConstraint(quotedFallback, "UQ_quoted_only"), true);
    assert.equal(matchesDuplicateKeyConstraint(quotedFallback, "UQ_quoted"), false);
  });

  it("matches constraint-form duplicate messages", () => {
    const error = duplicateWithConstraint("UQ_companies_name");
    assert.equal(matchesDuplicateKeyConstraint(error, "UQ_companies_name"), true);
  });
});
