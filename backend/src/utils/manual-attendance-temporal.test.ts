import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertOccurredAtCompatibleWithWorkday } from "./manual-attendance-temporal";
import { AppError } from "../errors/app-error";

describe("assertOccurredAtCompatibleWithWorkday", () => {
  const dayShift = {
    expectedStartAt: "2026-09-18T11:00:00.000Z",
    expectedEndAt: "2026-09-18T20:00:00.000Z",
  };

  it("accepts a valid time near schedule start", () => {
    assert.doesNotThrow(() =>
      assertOccurredAtCompatibleWithWorkday(dayShift, new Date("2026-09-18T11:05:00.000Z")),
    );
  });

  it("accepts overnight shift around midnight", () => {
    const night = {
      expectedStartAt: "2026-09-18T22:00:00.000Z",
      expectedEndAt: "2026-09-19T06:00:00.000Z",
    };
    assert.doesNotThrow(() =>
      assertOccurredAtCompatibleWithWorkday(night, new Date("2026-09-19T01:00:00.000Z")),
    );
  });

  it("rejects absurdly early dates", () => {
    assert.throws(
      () =>
        assertOccurredAtCompatibleWithWorkday(dayShift, new Date("2020-01-01T11:00:00.000Z")),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "OCCURRED_AT_OUTSIDE_WORKDAY");
        return true;
      },
    );
  });

  it("rejects absurdly late dates", () => {
    assert.throws(
      () =>
        assertOccurredAtCompatibleWithWorkday(dayShift, new Date("2030-01-01T11:00:00.000Z")),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "OCCURRED_AT_OUTSIDE_WORKDAY");
        return true;
      },
    );
  });

  it("accepts offsets that still fall within the schedule margin", () => {
    assert.doesNotThrow(() =>
      assertOccurredAtCompatibleWithWorkday(
        dayShift,
        new Date("2026-09-18T08:00:00.000-03:00"),
      ),
    );
  });
});
