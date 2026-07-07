import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AbsenceDayPeriod } from "../types/absence";
import {
  isWorkdayCoveredByAbsence,
  resolveEffectiveAbsenceForWorkday,
} from "./resolve-effective-absence-for-workday";

const TIMEZONE = "America/Argentina/Buenos_Aires";

const absence = (input: {
  id?: string;
  employeeId?: string;
  startDate: string;
  endDate: string;
  startPeriod?: AbsenceDayPeriod;
  endPeriod?: AbsenceDayPeriod;
  reviewedAt?: string;
  createdAt?: string;
}) => ({
  id: input.id ?? "absence-1",
  employeeId: input.employeeId ?? "emp-1",
  startDate: input.startDate,
  endDate: input.endDate,
  startPeriod: input.startPeriod ?? "FULL_DAY",
  endPeriod: input.endPeriod ?? "FULL_DAY",
  reviewedAt: input.reviewedAt ?? "2026-07-01T12:00:00.000Z",
  createdAt: input.createdAt ?? "2026-06-20T12:00:00.000Z",
});

const workday = (input: {
  workDate: string;
  expectedStartAt: string;
  expectedEndAt: string | null;
}) => ({
  workDate: input.workDate,
  expectedStartAt: input.expectedStartAt,
  expectedEndAt: input.expectedEndAt,
  scheduleTimezone: TIMEZONE,
});

describe("resolveEffectiveAbsenceForWorkday", () => {
  it("covers FULL_DAY absences for morning, afternoon and overnight shifts", () => {
    const model = absence({ startDate: "2026-08-03", endDate: "2026-08-03" });

    assert.equal(
      isWorkdayCoveredByAbsence(
        workday({
          workDate: "2026-08-03",
          expectedStartAt: "2026-08-03T09:00:00.000Z",
          expectedEndAt: "2026-08-03T15:00:00.000Z",
        }),
        model,
      ),
      true,
    );
    assert.equal(
      isWorkdayCoveredByAbsence(
        workday({
          workDate: "2026-08-03",
          expectedStartAt: "2026-08-03T16:00:00.000Z",
          expectedEndAt: "2026-08-04T00:00:00.000Z",
        }),
        model,
      ),
      true,
    );
    assert.equal(
      isWorkdayCoveredByAbsence(
        workday({
          workDate: "2026-08-03",
          expectedStartAt: "2026-08-04T01:00:00.000Z",
          expectedEndAt: "2026-08-04T09:00:00.000Z",
        }),
        model,
      ),
      true,
    );
  });

  it("covers AM absences only for morning shifts", () => {
    const model = absence({
      startDate: "2026-08-03",
      endDate: "2026-08-03",
      startPeriod: "AM",
      endPeriod: "AM",
    });

    assert.equal(
      isWorkdayCoveredByAbsence(
        workday({
          workDate: "2026-08-03",
          expectedStartAt: "2026-08-03T09:00:00.000Z",
          expectedEndAt: "2026-08-03T15:00:00.000Z",
        }),
        model,
      ),
      true,
    );
    assert.equal(
      isWorkdayCoveredByAbsence(
        workday({
          workDate: "2026-08-03",
          expectedStartAt: "2026-08-03T17:00:00.000Z",
          expectedEndAt: "2026-08-04T00:00:00.000Z",
        }),
        model,
      ),
      false,
    );
  });

  it("covers PM absences only for afternoon shifts", () => {
    const model = absence({
      startDate: "2026-08-03",
      endDate: "2026-08-03",
      startPeriod: "PM",
      endPeriod: "PM",
    });

    assert.equal(
      isWorkdayCoveredByAbsence(
        workday({
          workDate: "2026-08-03",
          expectedStartAt: "2026-08-03T09:00:00.000Z",
          expectedEndAt: "2026-08-03T15:00:00.000Z",
        }),
        model,
      ),
      false,
    );
    assert.equal(
      isWorkdayCoveredByAbsence(
        workday({
          workDate: "2026-08-03",
          expectedStartAt: "2026-08-03T16:00:00.000Z",
          expectedEndAt: "2026-08-04T00:00:00.000Z",
        }),
        model,
      ),
      true,
    );
  });

  it("covers overnight shifts with Monday PM and Tuesday AM absences", () => {
    const overnight = workday({
      workDate: "2026-08-03",
      expectedStartAt: "2026-08-04T01:00:00.000Z",
      expectedEndAt: "2026-08-04T09:00:00.000Z",
    });

    assert.equal(
      isWorkdayCoveredByAbsence(
        overnight,
        absence({
          startDate: "2026-08-03",
          endDate: "2026-08-03",
          startPeriod: "PM",
          endPeriod: "PM",
        }),
      ),
      true,
    );
    assert.equal(
      isWorkdayCoveredByAbsence(
        overnight,
        absence({
          id: "absence-tuesday-am",
          startDate: "2026-08-04",
          endDate: "2026-08-04",
          startPeriod: "AM",
          endPeriod: "AM",
        }),
      ),
      true,
    );
  });

  it("selects overlapping absences deterministically", () => {
    const selected = resolveEffectiveAbsenceForWorkday({
      workday: workday({
        workDate: "2026-08-03",
        expectedStartAt: "2026-08-03T09:00:00.000Z",
        expectedEndAt: "2026-08-03T15:00:00.000Z",
      }),
      approvedAbsences: [
        absence({
          id: "absence-b",
          startDate: "2026-08-03",
          endDate: "2026-08-03",
          reviewedAt: "2026-07-02T12:00:00.000Z",
          createdAt: "2026-06-21T12:00:00.000Z",
        }),
        absence({
          id: "absence-a",
          startDate: "2026-08-03",
          endDate: "2026-08-03",
          reviewedAt: "2026-07-01T12:00:00.000Z",
          createdAt: "2026-06-20T12:00:00.000Z",
        }),
      ],
    });

    assert.equal(selected?.id, "absence-a");
  });
});
