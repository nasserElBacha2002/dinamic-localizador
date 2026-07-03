import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const sampleStore = {
  id: "store-1",
  name: "Store 1",
  address: null,
  neighborhood: null,
  locality: null,
  storeFormat: "LEGACY_TYPE",
  latitude: -34.6,
  longitude: -58.38,
  allowedRadiusMeters: 150,
  googlePlaceId: null,
  active: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("storeService location type validation", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("creates store with active company location type", async () => {
    setupUnitTestEnv();
    const { companyLocationTypesService } = await import("./company-location-types.service");
    const { storeRepository } = await import("../repositories/store.repository");
    const { storeService } = await import("./store.service");

    mock.method(companyLocationTypesService, "assertActiveStoreFormat", async () => undefined);
    mock.method(storeRepository, "create", async (_companyId, input) => ({
      ...sampleStore,
      name: input.name,
      storeFormat: input.storeFormat ?? null,
    }));

    const created = await storeService.create("company-1", {
      name: "Warehouse A",
      latitude: -34.6,
      longitude: -58.38,
      storeFormat: "WAREHOUSE",
    });

    assert.equal(created.storeFormat, "WAREHOUSE");
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

  it("rejects inactive store format on create", async () => {
    setupUnitTestEnv();
    const { companyLocationTypesService } = await import("./company-location-types.service");
    const { storeService } = await import("./store.service");

    mock.method(companyLocationTypesService, "assertActiveStoreFormat", async () => {
      throw new AppError(
        400,
        "INACTIVE_LOCATION_TYPE",
        "El tipo de ubicación/servicio está inactivo y no puede asignarse.",
      );
    });

    await assert.rejects(
      () =>
        storeService.create("company-1", {
          name: "Store 1",
          latitude: -34.6,
          longitude: -58.38,
          storeFormat: "OLD_TYPE",
        }),
      (error: unknown) => error instanceof AppError && error.code === "INACTIVE_LOCATION_TYPE",
    );
  });

  it("updates store with active company location type", async () => {
    setupUnitTestEnv();
    const { companyLocationTypesService } = await import("./company-location-types.service");
    const { storeRepository } = await import("../repositories/store.repository");
    const { storeService } = await import("./store.service");

    mock.method(storeRepository, "findById", async () => sampleStore);
    mock.method(companyLocationTypesService, "assertActiveStoreFormat", async () => undefined);
    mock.method(storeRepository, "update", async (_companyId, _id, input) => ({
      ...sampleStore,
      storeFormat: input.storeFormat ?? sampleStore.storeFormat,
    }));

    const updated = await storeService.update("company-1", sampleStore.id, {
      storeFormat: "WAREHOUSE",
    });
    assert.equal(updated.storeFormat, "WAREHOUSE");
  });

  it("rejects unknown store format on update", async () => {
    setupUnitTestEnv();
    const { companyLocationTypesService } = await import("./company-location-types.service");
    const { storeRepository } = await import("../repositories/store.repository");
    const { storeService } = await import("./store.service");

    mock.method(storeRepository, "findById", async () => sampleStore);
    mock.method(companyLocationTypesService, "assertActiveStoreFormat", async () => {
      throw new AppError(
        400,
        "UNKNOWN_LOCATION_TYPE",
        "El tipo de ubicación/servicio no existe para esta empresa.",
      );
    });

    await assert.rejects(
      () =>
        storeService.update("company-1", sampleStore.id, {
          storeFormat: "UNKNOWN",
        }),
      (error: unknown) => error instanceof AppError && error.code === "UNKNOWN_LOCATION_TYPE",
    );
  });

  it("rejects inactive store format on update", async () => {
    setupUnitTestEnv();
    const { companyLocationTypesService } = await import("./company-location-types.service");
    const { storeRepository } = await import("../repositories/store.repository");
    const { storeService } = await import("./store.service");

    mock.method(storeRepository, "findById", async () => sampleStore);
    mock.method(companyLocationTypesService, "assertActiveStoreFormat", async () => {
      throw new AppError(
        400,
        "INACTIVE_LOCATION_TYPE",
        "El tipo de ubicación/servicio está inactivo y no puede asignarse.",
      );
    });

    await assert.rejects(
      () =>
        storeService.update("company-1", sampleStore.id, {
          storeFormat: "OLD_TYPE",
        }),
      (error: unknown) => error instanceof AppError && error.code === "INACTIVE_LOCATION_TYPE",
    );
  });

  it("reads existing store with legacy or inactive type without validation", async () => {
    setupUnitTestEnv();
    const { storeRepository } = await import("../repositories/store.repository");
    const { storeService } = await import("./store.service");

    mock.method(storeRepository, "findById", async () => ({
      ...sampleStore,
      storeFormat: "LEGACY_INACTIVE",
    }));

    const store = await storeService.getById("company-1", sampleStore.id);
    assert.equal(store.storeFormat, "LEGACY_INACTIVE");
  });
});
