import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const sampleService = {
  id: "service-1",
  name: "Service 1",
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

describe("serviceService location type validation", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("creates service with active company location type", async () => {
    setupUnitTestEnv();
    const { companyLocationTypesService } = await import("./company-location-types.service");
    const { serviceRepository } = await import("../repositories/service.repository");
    const { serviceService } = await import("./service.service");

    mock.method(companyLocationTypesService, "assertActiveStoreFormat", async () => undefined);
    mock.method(serviceRepository, "create", async (_companyId, input) => ({
      ...sampleService,
      name: input.name,
      storeFormat: input.storeFormat ?? null,
    }));

    const created = await serviceService.create("company-1", {
      name: "Warehouse A",
      latitude: -34.6,
      longitude: -58.38,
      storeFormat: "WAREHOUSE",
    });

    assert.equal(created.storeFormat, "WAREHOUSE");
  });

  it("rejects unknown service format on create", async () => {
    setupUnitTestEnv();
    const { companyLocationTypesService } = await import("./company-location-types.service");
    const { serviceService } = await import("./service.service");

    mock.method(companyLocationTypesService, "assertActiveStoreFormat", async () => {
      throw new AppError(
        400,
        "UNKNOWN_LOCATION_TYPE",
        "El tipo de ubicación/servicio no existe para esta empresa.",
      );
    });

    await assert.rejects(
      () =>
        serviceService.create("company-1", {
          name: "Service 1",
          latitude: -34.6,
          longitude: -58.38,
          storeFormat: "UNKNOWN",
        }),
      (error: unknown) => error instanceof AppError && error.code === "UNKNOWN_LOCATION_TYPE",
    );
  });

  it("rejects inactive service format on create", async () => {
    setupUnitTestEnv();
    const { companyLocationTypesService } = await import("./company-location-types.service");
    const { serviceService } = await import("./service.service");

    mock.method(companyLocationTypesService, "assertActiveStoreFormat", async () => {
      throw new AppError(
        400,
        "INACTIVE_LOCATION_TYPE",
        "El tipo de ubicación/servicio está inactivo y no puede asignarse.",
      );
    });

    await assert.rejects(
      () =>
        serviceService.create("company-1", {
          name: "Service 1",
          latitude: -34.6,
          longitude: -58.38,
          storeFormat: "OLD_TYPE",
        }),
      (error: unknown) => error instanceof AppError && error.code === "INACTIVE_LOCATION_TYPE",
    );
  });

  it("updates service with active company location type", async () => {
    setupUnitTestEnv();
    const { companyLocationTypesService } = await import("./company-location-types.service");
    const { serviceRepository } = await import("../repositories/service.repository");
    const { serviceService } = await import("./service.service");

    mock.method(serviceRepository, "findById", async () => sampleService);
    mock.method(companyLocationTypesService, "assertActiveStoreFormat", async () => undefined);
    mock.method(serviceRepository, "update", async (_companyId, _id, input) => ({
      ...sampleService,
      storeFormat: input.storeFormat ?? sampleService.storeFormat,
    }));

    const updated = await serviceService.update("company-1", sampleService.id, {
      storeFormat: "WAREHOUSE",
    });
    assert.equal(updated.storeFormat, "WAREHOUSE");
  });

  it("rejects unknown service format on update", async () => {
    setupUnitTestEnv();
    const { companyLocationTypesService } = await import("./company-location-types.service");
    const { serviceRepository } = await import("../repositories/service.repository");
    const { serviceService } = await import("./service.service");

    mock.method(serviceRepository, "findById", async () => sampleService);
    mock.method(companyLocationTypesService, "assertActiveStoreFormat", async () => {
      throw new AppError(
        400,
        "UNKNOWN_LOCATION_TYPE",
        "El tipo de ubicación/servicio no existe para esta empresa.",
      );
    });

    await assert.rejects(
      () =>
        serviceService.update("company-1", sampleService.id, {
          storeFormat: "UNKNOWN",
        }),
      (error: unknown) => error instanceof AppError && error.code === "UNKNOWN_LOCATION_TYPE",
    );
  });

  it("rejects inactive service format on update", async () => {
    setupUnitTestEnv();
    const { companyLocationTypesService } = await import("./company-location-types.service");
    const { serviceRepository } = await import("../repositories/service.repository");
    const { serviceService } = await import("./service.service");

    mock.method(serviceRepository, "findById", async () => sampleService);
    mock.method(companyLocationTypesService, "assertActiveStoreFormat", async () => {
      throw new AppError(
        400,
        "INACTIVE_LOCATION_TYPE",
        "El tipo de ubicación/servicio está inactivo y no puede asignarse.",
      );
    });

    await assert.rejects(
      () =>
        serviceService.update("company-1", sampleService.id, {
          storeFormat: "OLD_TYPE",
        }),
      (error: unknown) => error instanceof AppError && error.code === "INACTIVE_LOCATION_TYPE",
    );
  });

  it("reads existing service with legacy or inactive type without validation", async () => {
    setupUnitTestEnv();
    const { serviceRepository } = await import("../repositories/service.repository");
    const { serviceService } = await import("./service.service");

    mock.method(serviceRepository, "findById", async () => ({
      ...sampleService,
      storeFormat: "LEGACY_INACTIVE",
    }));

    const service = await serviceService.getById("company-1", sampleService.id);
    assert.equal(service.storeFormat, "LEGACY_INACTIVE");
  });
});
