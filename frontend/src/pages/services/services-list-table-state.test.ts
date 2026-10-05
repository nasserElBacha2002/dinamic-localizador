import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildServicesListApiFilters,
  SERVICE_SORT_FIELDS,
  SERVICE_TABLE_DEFAULTS,
  SERVICE_TABLE_FIELDS,
  SERVICE_TABLE_SORTABLE_COLUMN_KEYS,
  shouldClearServiceFormatFilter,
  shouldOmitServiceTableValue,
} from "./services-list-table-state";
import { SERVICE_LIST_SORT_FIELDS } from "../../types/service";

describe("services-list-table-state", () => {
  it("defines sortable fields used by the services table from a single contract", () => {
    assert.deepEqual([...SERVICE_SORT_FIELDS], [...SERVICE_LIST_SORT_FIELDS]);
    assert.deepEqual(SERVICE_TABLE_FIELDS.sortBy?.values, SERVICE_LIST_SORT_FIELDS);
    assert.equal(SERVICE_TABLE_DEFAULTS.sortBy, "createdAt");
    assert.equal(SERVICE_TABLE_DEFAULTS.sortOrder, "desc");
    for (const key of SERVICE_TABLE_SORTABLE_COLUMN_KEYS) {
      assert.ok((SERVICE_LIST_SORT_FIELDS as readonly string[]).includes(key));
    }
  });

  it("omits empty filter values from the URL", () => {
    assert.equal(
      shouldOmitServiceTableValue("locality", "", SERVICE_TABLE_DEFAULTS),
      true,
    );
    assert.equal(
      shouldOmitServiceTableValue("locality", "CABA", SERVICE_TABLE_DEFAULTS),
      false,
    );
  });

  it("builds API filters with locality/neighborhood cascade and sort directions", () => {
    const filters = buildServicesListApiFilters({
      ...SERVICE_TABLE_DEFAULTS,
      page: 2,
      pageSize: 25,
      search: "central",
      active: "true",
      serviceFormat: "SUPER",
      locality: "CABA",
      neighborhood: "Palermo",
      sortBy: "name",
      sortOrder: "asc",
    });

    assert.deepEqual(filters, {
      page: 2,
      limit: 25,
      search: "central",
      active: true,
      serviceFormat: "SUPER",
      locality: "CABA",
      neighborhood: "Palermo",
      sortBy: "name",
      sortDirection: "asc",
    });

    const withClient = buildServicesListApiFilters({
      ...SERVICE_TABLE_DEFAULTS,
      clientId: "11111111-1111-4111-8111-111111111111",
    });
    assert.equal(withClient.clientId, "11111111-1111-4111-8111-111111111111");

    const withoutLocality = buildServicesListApiFilters({
      ...SERVICE_TABLE_DEFAULTS,
      neighborhood: "Palermo",
      sortBy: "locality",
      sortOrder: "desc",
    });
    assert.equal(withoutLocality.neighborhood, undefined);
    assert.equal(withoutLocality.sortDirection, "desc");
    assert.equal("clientId" in withoutLocality, false);
  });

  it("does not clear the format filter while location types are still loading", () => {
    assert.equal(
      shouldClearServiceFormatFilter("CLIENT_FMT", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", undefined),
      false,
    );
  });

  it("clears an incompatible format after the catalog loads (async client change)", () => {
    const clientA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const clientB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const catalog = [
      { code: "CLIENT_FMT", clientId: clientA },
      { code: "GLOBAL_FMT", clientId: null },
    ];

    assert.equal(shouldClearServiceFormatFilter("CLIENT_FMT", clientB, catalog), true);
    assert.equal(shouldClearServiceFormatFilter("CLIENT_FMT", clientA, catalog), false);
    assert.equal(shouldClearServiceFormatFilter("GLOBAL_FMT", clientB, catalog), true);
  });

  it("keeps inactive format values representable when already selected", () => {
    const filters = buildServicesListApiFilters({
      ...SERVICE_TABLE_DEFAULTS,
      serviceFormat: "LEGACY_INACTIVE",
    });
    assert.equal(filters.serviceFormat, "LEGACY_INACTIVE");
  });
});
