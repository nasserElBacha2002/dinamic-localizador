import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { attendanceKeys } from "./attendance";
import { employeeKeys } from "./employees";
import {
  invalidateAfterImport,
  invalidateAttendanceReviewQueries,
  invalidateEmployeeScopedQueries,
  invalidateServiceScopedQueries,
} from "./invalidation";
import { LOOKUP_STALE_TIME_MS, lookupKeys, normalizeLookupSearchParams } from "./lookups";
import { operationKeys } from "./operations";
import { serviceKeys } from "./services";
import { statisticsKeys } from "./statistics";

describe("normalizeLookupSearchParams", () => {
  it("normalizes equivalent params to the same shape", () => {
    assert.deepEqual(normalizeLookupSearchParams({ search: "  cafe  ", limit: undefined }), {
      search: "cafe",
      activeOnly: true,
      limit: 10,
    });
    assert.deepEqual(normalizeLookupSearchParams({ search: "cafe", activeOnly: true, limit: 10 }), {
      search: "cafe",
      activeOnly: true,
      limit: 10,
    });
  });
});

describe("lookupKeys", () => {
  it("shares the same key for equivalent service searches", () => {
    const a = lookupKeys.serviceSearch("co-1", { search: "  x ", activeOnly: true, limit: 10 });
    const b = lookupKeys.serviceSearch("co-1", { search: "x", limit: 10 });
    assert.deepEqual(a, b);
  });

  it("separates different searches and companies", () => {
    const a = lookupKeys.serviceSearch("co-1", { search: "a", limit: 10 });
    const b = lookupKeys.serviceSearch("co-1", { search: "b", limit: 10 });
    const c = lookupKeys.serviceSearch("co-2", { search: "a", limit: 10 });
    assert.notDeepEqual(a, b);
    assert.notDeepEqual(a, c);
  });

  it("uses limit 10 in the normalized key by default", () => {
    const key = lookupKeys.serviceSearch("co-1", { search: "" });
    assert.equal(key[key.length - 1]?.limit, 10);
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
  it("invalidates lists, detail, facets and lookup prefixes for the company", async () => {
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
    assert.equal(client.getQueryState(detailKey)?.isInvalidated, true);
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
    const key = lookupKeys.serviceSearch(companyId, { search: "", limit: 10 });

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
