import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildServicesListApiFilters,
  SERVICE_SORT_FIELDS,
  SERVICE_TABLE_DEFAULTS,
  SERVICE_TABLE_FIELDS,
  SERVICE_TABLE_SORTABLE_COLUMN_KEYS,
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

    const withoutLocality = buildServicesListApiFilters({
      ...SERVICE_TABLE_DEFAULTS,
      neighborhood: "Palermo",
      sortBy: "locality",
      sortOrder: "desc",
    });
    assert.equal(withoutLocality.neighborhood, undefined);
    assert.equal(withoutLocality.sortDirection, "desc");
  });

  it("keeps inactive format values representable when already selected", () => {
    const filters = buildServicesListApiFilters({
      ...SERVICE_TABLE_DEFAULTS,
      serviceFormat: "LEGACY_INACTIVE",
    });
    assert.equal(filters.serviceFormat, "LEGACY_INACTIVE");
  });
});
