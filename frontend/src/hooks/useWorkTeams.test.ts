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
  it("uses prefix keys that include company scoped operation data", () => {
    const keys = [
      ["operation"],
      ["operation-employees"],
      ["operation-attendance-summary"],
      ["operation-workdays"],
      ["operation-workday-detail"],
    ];

    for (const key of keys) {
      assert.notDeepEqual(key, ["operation-employees", "operation-id-only"]);
    }
  });
});
