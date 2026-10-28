import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isOperationalLocationNameDuplicateKeyError,
  OPERATIONAL_LOCATION_COMPANY_NAME_UNIQUE_INDEX,
} from "./service-name-duplicate-errors";

const duplicateError = (indexName: string, number: number) =>
  Object.assign(
    new Error(
      `Cannot insert duplicate key row in object 'dbo.operational_locations' with unique index '${indexName}'. The duplicate key value is (...)`,
    ),
    { number },
  );

describe("service name duplicate key helpers", () => {
  it("detects company+name unique index conflicts for SQL error 2601", () => {
    const error = duplicateError(OPERATIONAL_LOCATION_COMPANY_NAME_UNIQUE_INDEX, 2601);
    assert.equal(isOperationalLocationNameDuplicateKeyError(error), true);
  });

  it("detects company+name unique constraint conflicts for SQL error 2627", () => {
    const error = Object.assign(
      new Error(
        `Violation of UNIQUE KEY constraint '${OPERATIONAL_LOCATION_COMPANY_NAME_UNIQUE_INDEX}'. Cannot insert duplicate key in object 'dbo.operational_locations'.`,
      ),
      { number: 2627 },
    );
    assert.equal(isOperationalLocationNameDuplicateKeyError(error), true);
  });

  it("does not treat unrelated duplicate key errors as service name conflicts", () => {
    const error = duplicateError("UQ_companies_name", 2601);
    assert.equal(isOperationalLocationNameDuplicateKeyError(error), false);
  });

  it("does not map non-duplicate SQL errors", () => {
    const error = Object.assign(
      new Error(`Violation of UNIQUE KEY constraint '${OPERATIONAL_LOCATION_COMPANY_NAME_UNIQUE_INDEX}'`),
      { number: 547 },
    );
    assert.equal(isOperationalLocationNameDuplicateKeyError(error), false);
  });
});
