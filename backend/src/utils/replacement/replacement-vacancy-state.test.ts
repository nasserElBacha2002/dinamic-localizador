import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAbsentWorkdayVacancyActive } from "./replacement-vacancy-state";

describe("isAbsentWorkdayVacancyActive", () => {
  it("accepts EXPECTED workdays with unavailable_at", () => {
    assert.equal(
      isAbsentWorkdayVacancyActive({
        workdayStatus: "ACTIVE",
        expectationStatus: "EXPECTED",
        unavailableAt: "2026-11-17T12:00:00.000Z",
        absenceRequestId: null,
      }),
      true,
    );
  });

  it("accepts JUSTIFIED workdays linked to an absence request", () => {
    assert.equal(
      isAbsentWorkdayVacancyActive({
        workdayStatus: "ACTIVE",
        expectationStatus: "JUSTIFIED",
        unavailableAt: null,
        absenceRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
      true,
    );
  });

  it("accepts JUSTIFIED workdays with prior unavailability when absence is linked", () => {
    assert.equal(
      isAbsentWorkdayVacancyActive({
        workdayStatus: "ACTIVE",
        expectationStatus: "JUSTIFIED",
        unavailableAt: "2026-11-17T12:00:00.000Z",
        absenceRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
      true,
    );
  });

  it("rejects JUSTIFIED with unavailable_at but no absence link", () => {
    assert.equal(
      isAbsentWorkdayVacancyActive({
        workdayStatus: "ACTIVE",
        expectationStatus: "JUSTIFIED",
        unavailableAt: "2026-11-17T12:00:00.000Z",
        absenceRequestId: null,
      }),
      false,
    );
  });

  it("rejects inactive workdays", () => {
    assert.equal(
      isAbsentWorkdayVacancyActive({
        workdayStatus: "CANCELLED",
        expectationStatus: "EXPECTED",
        unavailableAt: "2026-11-17T12:00:00.000Z",
        absenceRequestId: null,
      }),
      false,
    );
  });
});