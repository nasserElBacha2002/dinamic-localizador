import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { attendanceKeys } from "./attendance";
import { employeeKeys } from "./employees";
import {
  invalidateAfterImport,
  invalidateAttendanceReviewQueries,
  invalidateEmployeeScopedQueries,
  invalidateEmployeeTransferQueries,
  invalidateServiceScopedQueries,
} from "./invalidation";
import {
  DEFAULT_LOOKUP_LIMIT,
  LOOKUP_STALE_TIME_MS,
  lookupKeys,
  normalizeLookupSearchParams,
} from "./lookups";
import { operationKeys } from "./operations";
import { serviceKeys } from "./services";
import { statisticsKeys } from "./statistics";
import { workTeamKeys } from "./work-teams";

describe("normalizeLookupSearchParams", () => {
  it("normalizes equivalent params to the same shape", () => {
    assert.deepEqual(normalizeLookupSearchParams({ search: "  cafe  ", limit: undefined }), {
      search: "cafe",
      activeOnly: true,
      limit: DEFAULT_LOOKUP_LIMIT,
    });
    assert.deepEqual(
      normalizeLookupSearchParams({
        search: "cafe",
        activeOnly: true,
        limit: DEFAULT_LOOKUP_LIMIT,
      }),
      {
        search: "cafe",
        activeOnly: true,
        limit: DEFAULT_LOOKUP_LIMIT,
      },
    );
  });
});

describe("lookupKeys", () => {
  it("shares the same key for equivalent service searches", () => {
    const a = lookupKeys.serviceSearch("co-1", {
      search: "  x ",
      activeOnly: true,
      limit: DEFAULT_LOOKUP_LIMIT,
    });
    const b = lookupKeys.serviceSearch("co-1", { search: "x", limit: DEFAULT_LOOKUP_LIMIT });
    assert.deepEqual(a, b);
  });

  it("separates different searches and companies", () => {
    const a = lookupKeys.serviceSearch("co-1", { search: "a", limit: DEFAULT_LOOKUP_LIMIT });
    const b = lookupKeys.serviceSearch("co-1", { search: "b", limit: DEFAULT_LOOKUP_LIMIT });
    const c = lookupKeys.serviceSearch("co-2", { search: "a", limit: DEFAULT_LOOKUP_LIMIT });
    assert.notDeepEqual(a, b);
    assert.notDeepEqual(a, c);
  });

  it("uses DEFAULT_LOOKUP_LIMIT in the normalized key by default", () => {
    const key = lookupKeys.serviceSearch("co-1", { search: "" });
    assert.equal(key[key.length - 1]?.limit, DEFAULT_LOOKUP_LIMIT);
  });

  it("keeps selected-by-id keys distinct from search and from each other", () => {
    const search = lookupKeys.serviceSearch("co-1", { search: "x", limit: DEFAULT_LOOKUP_LIMIT });
    const selectedA = lookupKeys.serviceSelected("co-1", "svc-a");
    const selectedB = lookupKeys.serviceSelected("co-1", "svc-b");
    const selectedOtherCompany = lookupKeys.serviceSelected("co-2", "svc-a");

    assert.notDeepEqual(search, selectedA);
    assert.notDeepEqual(selectedA, selectedB);
    assert.notDeepEqual(selectedA, selectedOtherCompany);

    assert.notDeepEqual(
      lookupKeys.employeeSelected("co-1", "emp-a"),
      lookupKeys.employeeSelected("co-1", "emp-b"),
    );
    assert.notDeepEqual(
      lookupKeys.operationSelected("co-1", "op-a"),
      lookupKeys.operationSelected("co-1", "op-b"),
    );
    assert.notDeepEqual(
      lookupKeys.employeeSearch("co-1", { search: "a", limit: DEFAULT_LOOKUP_LIMIT }),
      lookupKeys.employeeSelected("co-1", "a"),
    );
  });
});

describe("attendanceKeys vs legacy invalidation", () => {
  it("detail/reviews include companyId before attendanceId", () => {
    assert.deepEqual(attendanceKeys.detail("co-1", "att-1"), [
      "attendance-record",
      "co-1",
      "att-1",
    ]);
    assert.deepEqual(attendanceKeys.reviews("co-1", "att-1", 1, 10), [
      "attendance-reviews",
      "co-1",
      "att-1",
      1,
      10,
    ]);
  });

  it("legacy key without companyId does not match the real detail query", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const realKey = attendanceKeys.detail("co-1", "att-1");
    client.setQueryData(realKey, { id: "att-1", status: "PENDING" });

    await client.invalidateQueries({ queryKey: ["attendance-record", "att-1"] });
    const stateAfterLegacy = client.getQueryState(realKey);
    assert.equal(stateAfterLegacy?.isInvalidated, false);

    await invalidateAttendanceReviewQueries(client, "co-1", "att-1");
    const stateAfterFix = client.getQueryState(realKey);
    assert.equal(stateAfterFix?.isInvalidated, true);
    client.clear();
  });
});

describe("invalidateServiceScopedQueries", () => {
  it("invalidates lists, facets and lookups but not the exact detail", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const companyId = "co-1";
    const listKey = serviceKeys.list(companyId, { page: 1, limit: 10 });
    const detailKey = serviceKeys.detail(companyId, "svc-1");
    const facetsKey = serviceKeys.facets(companyId);
    const lookupKey = lookupKeys.serviceSearch(companyId, { search: "", limit: 10 });
    const otherCompany = serviceKeys.list("co-2", { page: 1, limit: 10 });

    for (const key of [listKey, detailKey, facetsKey, lookupKey, otherCompany]) {
      client.setQueryData(key, { ok: true });
    }

    await invalidateServiceScopedQueries(client, companyId);

    assert.equal(client.getQueryState(listKey)?.isInvalidated, true);
    assert.equal(client.getQueryState(detailKey)?.isInvalidated, false);
    assert.equal(client.getQueryState(facetsKey)?.isInvalidated, true);
    assert.equal(client.getQueryState(lookupKey)?.isInvalidated, true);
    assert.equal(client.getQueryState(otherCompany)?.isInvalidated, false);
    client.clear();
  });
});

describe("invalidateEmployeeScopedQueries", () => {
  it("invalidates employee CRUD and lookup caches for the company", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const companyId = "co-1";
    const listKey = employeeKeys.list(companyId, { page: 1 });
    const lookupKey = lookupKeys.employeeSearch(companyId, { search: "ana", limit: 10 });
    client.setQueryData(listKey, { ok: true });
    client.setQueryData(lookupKey, [{ id: "e1" }]);

    await invalidateEmployeeScopedQueries(client, companyId);

    assert.equal(client.getQueryState(listKey)?.isInvalidated, true);
    assert.equal(client.getQueryState(lookupKey)?.isInvalidated, true);
    client.clear();
  });
});

describe("invalidateAfterImport", () => {
  it("invalidates services and lookups for services import", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const companyId = "co-1";
    const listKey = serviceKeys.list(companyId, { page: 1 });
    const lookupKey = lookupKeys.serviceSearch(companyId, { search: "", limit: 10 });
    client.setQueryData(listKey, { ok: true });
    client.setQueryData(lookupKey, []);

    await invalidateAfterImport(client, companyId, "services");

    assert.equal(client.getQueryState(listKey)?.isInvalidated, true);
    assert.equal(client.getQueryState(lookupKey)?.isInvalidated, true);
    client.clear();
  });

  it("invalidates employees and lookups for employees import", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const companyId = "co-1";
    const listKey = employeeKeys.list(companyId, { page: 1 });
    const lookupKey = lookupKeys.employeeSearch(companyId, { search: "", limit: 10 });
    client.setQueryData(listKey, { ok: true });
    client.setQueryData(lookupKey, []);

    await invalidateAfterImport(client, companyId, "employees");

    assert.equal(client.getQueryState(listKey)?.isInvalidated, true);
    assert.equal(client.getQueryState(lookupKey)?.isInvalidated, true);
    client.clear();
  });

  it("invalidates operations and statistics for operations import", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const companyId = "co-1";
    const listKey = operationKeys.list(companyId, { page: 1 });
    const statsKey = statisticsKeys.summary(companyId, { from: "2026-01-01" });
    client.setQueryData(listKey, { ok: true });
    client.setQueryData(statsKey, { ok: true });

    await invalidateAfterImport(client, companyId, "operations");

    assert.equal(client.getQueryState(listKey)?.isInvalidated, true);
    assert.equal(client.getQueryState(statsKey)?.isInvalidated, true);
    client.clear();
  });
});

describe("lookup staleTime vs mutation invalidation", () => {
  it("serves cached lookup within staleTime then refetches after invalidation", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    let fetches = 0;
    const companyId = "co-1";
    const key = lookupKeys.serviceSearch(companyId, {
      search: "",
      limit: DEFAULT_LOOKUP_LIMIT,
    });

    const options = {
      queryKey: key,
      queryFn: async () => {
        fetches += 1;
        return [{ id: "s1", name: "A", address: null }];
      },
      staleTime: LOOKUP_STALE_TIME_MS,
    };

    await client.fetchQuery(options);
    await client.fetchQuery(options);
    assert.equal(fetches, 1);

    await invalidateServiceScopedQueries(client, companyId);
    await client.fetchQuery(options);
    assert.equal(fetches, 2);
    client.clear();
  });
});

describe("invalidateEmployeeTransferQueries", () => {
  it("invalidates source and target only; leaves a third company untouched", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const source = "co-a";
    const target = "co-b";
    const third = "co-c";
    const employeeId = "emp-1";

    const sourceList = employeeKeys.list(source, { page: 1 });
    const targetList = employeeKeys.list(target, { page: 1 });
    const thirdList = employeeKeys.list(third, { page: 1 });
    const sourceDetail = employeeKeys.detail(source, employeeId);
    const targetDetail = employeeKeys.detail(target, employeeId);
    const sourceTeams = workTeamKeys.list(source, { page: 1 });
    const thirdTeams = workTeamKeys.list(third, { page: 1 });

    for (const key of [
      sourceList,
      targetList,
      thirdList,
      sourceDetail,
      targetDetail,
      sourceTeams,
      thirdTeams,
    ]) {
      client.setQueryData(key, { ok: true });
    }

    await invalidateEmployeeTransferQueries(client, source, target, employeeId);

    assert.equal(client.getQueryState(sourceList)?.isInvalidated, true);
    assert.equal(client.getQueryState(targetList)?.isInvalidated, true);
    assert.equal(client.getQueryState(thirdList)?.isInvalidated, false);
    assert.equal(client.getQueryData(sourceDetail), undefined);
    assert.equal(client.getQueryState(targetDetail)?.isInvalidated, true);
    assert.equal(client.getQueryState(sourceTeams)?.isInvalidated, true);
    assert.equal(client.getQueryState(thirdTeams)?.isInvalidated, false);
    client.clear();
  });
});

describe("invalidateAfterImport multi-company", () => {
  it("invalidates only companies listed in affectedCompanyIds", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const listA = employeeKeys.list("co-a", { page: 1 });
    const listB = employeeKeys.list("co-b", { page: 1 });
    const listC = employeeKeys.list("co-c", { page: 1 });
    client.setQueryData(listA, { ok: true });
    client.setQueryData(listB, { ok: true });
    client.setQueryData(listC, { ok: true });

    await invalidateAfterImport(client, "co-a", "employees", ["co-a", "co-b"]);

    assert.equal(client.getQueryState(listA)?.isInvalidated, true);
    assert.equal(client.getQueryState(listB)?.isInvalidated, true);
    assert.equal(client.getQueryState(listC)?.isInvalidated, false);
    client.clear();
  });
});

describe("captured company mutation write", () => {
  it("writes detail under the company captured at mutation start, not the active company", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const capturedCompanyId = "co-a";
    const activeCompanyId = "co-b";
    const employeeId = "emp-1";
    const updated = { id: employeeId, name: "Updated" };

    client.setQueryData(employeeKeys.detail(capturedCompanyId, employeeId), {
      id: employeeId,
      name: "Old",
    });
    client.setQueryData(employeeKeys.detail(activeCompanyId, employeeId), {
      id: employeeId,
      name: "B-side",
    });

    // Simulate onSuccess using variables.companyId (captured), not activeCompanyId.
    client.setQueryData(employeeKeys.detail(capturedCompanyId, employeeId), updated);
    await invalidateEmployeeScopedQueries(client, capturedCompanyId);

    assert.deepEqual(client.getQueryData(employeeKeys.detail(capturedCompanyId, employeeId)), updated);
    assert.deepEqual(client.getQueryData(employeeKeys.detail(activeCompanyId, employeeId)), {
      id: employeeId,
      name: "B-side",
    });
    assert.equal(
      client.getQueryState(employeeKeys.list(activeCompanyId, { page: 1 }))?.isInvalidated,
      undefined,
    );
    client.clear();
  });
});
