import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { employeeWorkdayAttendanceDetailPath } from "./attendance-list-display";

describe("employeeWorkdayAttendanceDetailPath", () => {
  it("uses canonical attendance workday route", () => {
    assert.equal(
      employeeWorkdayAttendanceDetailPath("ew-42"),
      "/attendance/workdays/ew-42",
    );
  });
});
