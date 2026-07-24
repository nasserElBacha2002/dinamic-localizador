import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyEmployeeUniqueViolation,
  classifyServiceUniqueViolation,
  EMPLOYEE_COMPANY_PHONE_UNIQUE_INDEX,
} from "../imports/constraint-classifiers";
import { OPERATIONAL_LOCATION_COMPANY_NAME_UNIQUE_INDEX } from "../utils/service-name-duplicate-errors";

describe("import constraint classifiers", () => {
  it("maps employee phone unique index", () => {
    const classified = classifyEmployeeUniqueViolation({
      number: 2601,
      message: `Cannot insert duplicate key row in object 'dbo.employees' with unique index '${EMPLOYEE_COMPANY_PHONE_UNIQUE_INDEX}'.`,
    });
    assert.equal(classified?.code, "EMPLOYEE_PHONE_ALREADY_EXISTS");
    assert.equal(classified?.field, "phoneNumber");
  });

  it("returns generic conflict for unknown employee unique index", () => {
    const classified = classifyEmployeeUniqueViolation({
      number: 2627,
      message: "Violation of UNIQUE KEY constraint 'UQ_employees_something_else'.",
    });
    assert.equal(classified?.code, "EMPLOYEE_UNIQUE_CONSTRAINT_CONFLICT");
    assert.equal(classified?.field, "unknown");
  });

  it("maps service name unique index", () => {
    const classified = classifyServiceUniqueViolation({
      number: 2601,
      message: `duplicate key with unique index '${OPERATIONAL_LOCATION_COMPANY_NAME_UNIQUE_INDEX}'`,
    });
    assert.equal(classified?.code, "SERVICE_NAME_ALREADY_EXISTS");
    assert.equal(classified?.field, "name");
  });

  it("returns null when error is not a duplicate key", () => {
    assert.equal(classifyEmployeeUniqueViolation(new Error("timeout")), null);
    assert.equal(classifyServiceUniqueViolation({ number: 547, message: "FK" }), null);
  });
});
