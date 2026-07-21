import { z } from "zod";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listServicesQuerySchema } from "./service.schema";

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
});
