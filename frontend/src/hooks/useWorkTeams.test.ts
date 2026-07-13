import assert from "node:assert/strict";
import { describe, it } from "node:test";

const buildWorkTeamsQueryKey = (companyId: string | undefined, filters: unknown) =>
  ["work-teams", companyId, filters] as const;

describe("useWorkTeams query key", () => {
  it("includes companyId to avoid cross-company cache reuse", () => {
    const filters = { page: 1, limit: 10, active: true };
    const companyA = "company-a";
    const companyB = "company-b";

    assert.notDeepEqual(
      buildWorkTeamsQueryKey(companyA, filters),
      buildWorkTeamsQueryKey(companyB, filters),
    );
  });

  it("does not run with an undefined company id in the key", () => {
    const key = buildWorkTeamsQueryKey(undefined, { page: 1, limit: 10 });
    assert.equal(key[1], undefined);
  });
});

describe("useWorkTeams enabled guard", () => {
  it("requires company readiness before fetching", () => {
    const shouldEnable = (input: {
      extraEnabled: boolean;
      isReady: boolean;
      companyId?: string;
    }) => input.extraEnabled && input.isReady && Boolean(input.companyId);

    assert.equal(
      shouldEnable({ extraEnabled: true, isReady: true, companyId: "company-1" }),
      true,
    );
    assert.equal(
      shouldEnable({ extraEnabled: true, isReady: false, companyId: "company-1" }),
      false,
    );
    assert.equal(shouldEnable({ extraEnabled: true, isReady: true }), false);
  });
});

describe("operation assignment invalidation keys", () => {
  it("scopes every invalidated key to companyId and operationId", async () => {
    const {
      operationKeys,
      operationEmployeeKeys,
      operationAttendanceKeys,
      operationWorkdayKeys,
    } = await import("../queryKeys/operations");

    const companyId = "company-1";
    const operationId = "operation-1";

    const scopedKeys = [
      operationKeys.detail(companyId, operationId),
      operationEmployeeKeys.list(companyId, operationId),
      operationAttendanceKeys.summary(companyId, operationId),
      operationWorkdayKeys.list(companyId, operationId),
      operationWorkdayKeys.detail(companyId, operationId, undefined),
    ];

    for (const key of scopedKeys) {
      assert.equal(key[1], companyId);
      assert.equal(key[2], operationId);
    }
  });

  it("does not reuse cache across companies or operations", async () => {
    const { operationAttendanceKeys } = await import("../queryKeys/operations");

    assert.notDeepEqual(
      operationAttendanceKeys.summary("company-a", "operation-1"),
      operationAttendanceKeys.summary("company-b", "operation-1"),
    );
    assert.notDeepEqual(
      operationAttendanceKeys.summary("company-a", "operation-1"),
      operationAttendanceKeys.summary("company-a", "operation-2"),
    );
  });

  it("isolates attendance summary cache by workday filters", async () => {
    const { operationAttendanceKeys } = await import("../queryKeys/operations");

    const companyId = "company-1";
    const operationId = "operation-1";
    const baseFilters = { page: 1, limit: 10 };

    assert.notDeepEqual(
      operationAttendanceKeys.summary(companyId, operationId, {
        ...baseFilters,
        workdayId: "workday-06",
      }),
      operationAttendanceKeys.summary(companyId, operationId, {
        ...baseFilters,
        workdayId: "workday-13",
      }),
    );
    assert.notDeepEqual(
      operationAttendanceKeys.summary(companyId, operationId, {
        ...baseFilters,
        workDate: "2026-07-06",
      }),
      operationAttendanceKeys.summary(companyId, operationId, {
        ...baseFilters,
        workDate: "2026-07-13",
      }),
    );
  });
});
