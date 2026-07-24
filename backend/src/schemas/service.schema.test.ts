import { z } from "zod";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createServiceSchema,
  listServicesQuerySchema,
  SERVICE_LIST_SORT_FIELDS,
} from "./service.schema";
import { SERVICE_FORMAT_MAX_LENGTH } from "../utils/normalize-optional-text";
import { SERVICE_LIST_SORT_COLUMNS } from "../repositories/service.repository";

describe("listServicesQuerySchema", () => {
  it("accepts format, locality, neighborhood and sort filters", () => {
    const parsed = listServicesQuerySchema.parse({
      page: "1",
      limit: "10",
      serviceFormat: "SUPER",
      locality: "CABA",
      neighborhood: "Palermo",
      sortBy: "name",
      sortDirection: "desc",
    });

    assert.equal(parsed.serviceFormat, "SUPER");
    assert.equal(parsed.locality, "CABA");
    assert.equal(parsed.neighborhood, "Palermo");
    assert.equal(parsed.sortBy, "name");
    assert.equal(parsed.sortDirection, "desc");
  });

  it("rejects unknown sort fields", () => {
    assert.throws(
      () =>
        listServicesQuerySchema.parse({
          sortBy: "latitude",
        }),
      z.ZodError,
    );
  });

  it("rejects sort injection payloads", () => {
    assert.throws(
      () =>
        listServicesQuerySchema.parse({
          sortBy: "name; DROP TABLE operational_locations--",
        }),
      z.ZodError,
    );
  });

  it("accepts serviceFormat at max length and rejects longer values", () => {
    const max = "F".repeat(SERVICE_FORMAT_MAX_LENGTH);
    const parsed = listServicesQuerySchema.parse({ serviceFormat: max });
    assert.equal(parsed.serviceFormat, max);

    assert.throws(
      () =>
        listServicesQuerySchema.parse({
          serviceFormat: `${max}X`,
        }),
      z.ZodError,
    );
  });
});

describe("createServiceSchema serviceFormat length", () => {
  it("accepts max length and rejects overflow", () => {
    const max = "A".repeat(SERVICE_FORMAT_MAX_LENGTH);
    const base = {
      name: "Local",
      latitude: -34.6,
      longitude: -58.3,
      allowedRadiusMeters: 150,
    };

    assert.equal(createServiceSchema.parse({ ...base, serviceFormat: max }).serviceFormat, max);
    assert.throws(
      () => createServiceSchema.parse({ ...base, serviceFormat: `${max}X` }),
      z.ZodError,
    );
  });
});

describe("SERVICE_LIST_SORT_COLUMNS exhaustiveness", () => {
  it("maps every accepted sort field to a SQL column", () => {
    for (const field of SERVICE_LIST_SORT_FIELDS) {
      assert.equal(typeof SERVICE_LIST_SORT_COLUMNS[field], "string");
      assert.match(SERVICE_LIST_SORT_COLUMNS[field], /^[a-z_]+$/);
    }
    assert.deepEqual(
      [...SERVICE_LIST_SORT_FIELDS].sort(),
      Object.keys(SERVICE_LIST_SORT_COLUMNS).sort(),
    );
  });
});
