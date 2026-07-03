import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

describe("storeService location type validation", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("rejects unknown store format on create", async () => {
    setupUnitTestEnv();
    const { companyLocationTypesService } = await import("./company-location-types.service");
    const { storeService } = await import("./store.service");

    mock.method(companyLocationTypesService, "assertActiveStoreFormat", async () => {
      throw new AppError(
        400,
        "UNKNOWN_LOCATION_TYPE",
        "El tipo de ubicación/servicio no existe para esta empresa.",
      );
    });

    await assert.rejects(
      () =>
        storeService.create("company-1", {
          name: "Store 1",
          latitude: -34.6,
          longitude: -58.38,
          storeFormat: "UNKNOWN",
        }),
      (error: unknown) => error instanceof AppError && error.code === "UNKNOWN_LOCATION_TYPE",
    );
  });
});
