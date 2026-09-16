import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OperationShiftVersion } from "../types/operation-shift";
import { partitionShiftVersions, resolveCurrentShiftVersion } from "./operation-shift-version";

function version(
  partial: Partial<OperationShiftVersion> &
    Pick<OperationShiftVersion, "id" | "effectiveFrom" | "effectiveUntil">,
): OperationShiftVersion {
  return {
    companyId: "c1",
    operationShiftId: "s1",
    startTime: "08:00",
    endTime: "16:00",
    days: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("resolveCurrentShiftVersion", () => {
  it("picks version where effectiveFrom <= refDate and until is null or >= refDate", () => {
    const versions = [
      version({ id: "past", effectiveFrom: "2026-01-01", effectiveUntil: "2026-06-30" }),
      version({ id: "current", effectiveFrom: "2026-07-01", effectiveUntil: null }),
      version({ id: "future", effectiveFrom: "2026-10-01", effectiveUntil: null }),
    ];
    assert.equal(resolveCurrentShiftVersion(versions, "2026-07-15")?.id, "current");
    assert.equal(resolveCurrentShiftVersion(versions, "2026-06-15")?.id, "past");
    assert.equal(resolveCurrentShiftVersion(versions, "2025-12-01"), null);
  });

  it("includes effectiveUntil boundary (refDate <= effectiveUntil)", () => {
    const versions = [
      version({ id: "bounded", effectiveFrom: "2026-01-01", effectiveUntil: "2026-07-15" }),
    ];
    assert.equal(resolveCurrentShiftVersion(versions, "2026-07-15")?.id, "bounded");
    assert.equal(resolveCurrentShiftVersion(versions, "2026-07-16"), null);
  });
});

describe("partitionShiftVersions", () => {
  it("separates current, upcoming and past", () => {
    const versions = [
      version({ id: "past", effectiveFrom: "2026-01-01", effectiveUntil: "2026-06-30" }),
      version({ id: "current", effectiveFrom: "2026-07-01", effectiveUntil: null }),
      version({ id: "upcoming", effectiveFrom: "2026-10-01", effectiveUntil: null }),
    ];
    const partitioned = partitionShiftVersions(versions, "2026-07-15");
    assert.equal(partitioned.current?.id, "current");
    assert.deepEqual(
      partitioned.upcoming.map((item) => item.id),
      ["upcoming"],
    );
    assert.deepEqual(
      partitioned.past.map((item) => item.id),
      ["past"],
    );
  });
});
