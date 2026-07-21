import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SERVICE_TABLE_DEFAULTS,
  SERVICE_TABLE_FIELDS,
  shouldOmitServiceTableValue,
} from "./services-list-table-state";

describe("services-list-table-state", () => {
  it("defines sortable fields used by the services table", () => {
    assert.deepEqual(SERVICE_TABLE_FIELDS.sortBy?.values, [
      "name",
      "neighborhood",
      "locality",
      "serviceFormat",
      "address",
      "active",
      "createdAt",
    ]);
    assert.equal(SERVICE_TABLE_DEFAULTS.sortBy, "createdAt");
    assert.equal(SERVICE_TABLE_DEFAULTS.sortOrder, "desc");
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
});
