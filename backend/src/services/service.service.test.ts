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
  locationZoneId: null,
  serviceFormat: "LEGACY_TYPE",
  latitude: -34.6,
  longitude: -58.38,
  allowedRadiusMeters: 150,
  googlePlaceId: null,
  active: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  clientId: null,
};

describe("serviceService location type validation", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("creates service with active company location type", async () => {
    setupUnitTestEnv();
    const { companyLocationTypesService } = await import("./company-location-types.service");
    const { locationZoneService } = await import("./location-zone.service");
    const { serviceRepository } = await import("../repositories/service.repository");
    const { serviceService } = await import("./service.service");

    mock.method(companyLocationTypesService, "assertActiveServiceFormat", async () => undefined);
    mock.method(locationZoneService, "findOrCreateByNameLocality", async () => null);
    mock.method(serviceRepository, "findByCompanyAndName", async () => null);
    mock.method(serviceRepository, "create", async (_companyId, input) => ({
      ...sampleService,
      name: input.name,
      serviceFormat: input.serviceFormat ?? null,
    }));

    const created = await serviceService.create("company-1", {
      name: "Warehouse A",
      latitude: -34.6,
      longitude: -58.38,
      serviceFormat: "WAREHOUSE",
    });

    assert.equal(created.serviceFormat, "WAREHOUSE");
  });

  it("rejects unknown service format on create", async () => {
    setupUnitTestEnv();
    const { companyLocationTypesService } = await import("./company-location-types.service");
    const { serviceService } = await import("./service.service");

    mock.method(companyLocationTypesService, "assertActiveServiceFormat", async () => {
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
          serviceFormat: "UNKNOWN",
        }),
      (error: unknown) => error instanceof AppError && error.code === "UNKNOWN_LOCATION_TYPE",
    );
  });

  it("rejects inactive service format on create", async () => {
    setupUnitTestEnv();
    const { companyLocationTypesService } = await import("./company-location-types.service");
    const { serviceService } = await import("./service.service");

    mock.method(companyLocationTypesService, "assertActiveServiceFormat", async () => {
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
          serviceFormat: "OLD_TYPE",
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
    mock.method(companyLocationTypesService, "assertActiveServiceFormat", async () => undefined);
    mock.method(serviceRepository, "update", async (_companyId, _id, input) => ({
      ...sampleService,
      serviceFormat: input.serviceFormat ?? sampleService.serviceFormat,
    }));

    const updated = await serviceService.update("company-1", sampleService.id, {
      serviceFormat: "WAREHOUSE",
    });
    assert.equal(updated.serviceFormat, "WAREHOUSE");
  });

  it("rejects unknown service format on update", async () => {
    setupUnitTestEnv();
    const { companyLocationTypesService } = await import("./company-location-types.service");
    const { serviceRepository } = await import("../repositories/service.repository");
    const { serviceService } = await import("./service.service");

    mock.method(serviceRepository, "findById", async () => sampleService);
    mock.method(companyLocationTypesService, "assertActiveServiceFormat", async () => {
      throw new AppError(
        400,
        "UNKNOWN_LOCATION_TYPE",
        "El tipo de ubicación/servicio no existe para esta empresa.",
      );
    });

    await assert.rejects(
      () =>
        serviceService.update("company-1", sampleService.id, {
          serviceFormat: "UNKNOWN",
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
    mock.method(companyLocationTypesService, "assertActiveServiceFormat", async () => {
      throw new AppError(
        400,
        "INACTIVE_LOCATION_TYPE",
        "El tipo de ubicación/servicio está inactivo y no puede asignarse.",
      );
    });

    await assert.rejects(
      () =>
        serviceService.update("company-1", sampleService.id, {
          serviceFormat: "OLD_TYPE",
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
      serviceFormat: "LEGACY_INACTIVE",
    }));

    const service = await serviceService.getById("company-1", sampleService.id);
    assert.equal(service.serviceFormat, "LEGACY_INACTIVE");
  });
});

describe("serviceService client validation", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("creates without a client and does not validate one", async () => {
    setupUnitTestEnv();
    const { clientRepository } = await import("../repositories/client.repository");
    const { companyLocationTypesService } = await import("./company-location-types.service");
    const { locationZoneService } = await import("./location-zone.service");
    const { serviceRepository } = await import("../repositories/service.repository");
    const { serviceService } = await import("./service.service");

    mock.method(clientRepository, "findById", async () => {
      throw new Error("A client should not be looked up when it is omitted");
    });
    mock.method(companyLocationTypesService, "assertActiveServiceFormat", async () => undefined);
    mock.method(locationZoneService, "findOrCreateByNameLocality", async () => null);
    mock.method(serviceRepository, "findByCompanyAndName", async () => null);
    mock.method(serviceRepository, "create", async (_companyId, input) => ({
      ...sampleService,
      clientId: input.clientId ?? null,
    }));

    const created = await serviceService.create("company-1", {
      name: "Sucursal sin cliente",
      latitude: -34.6,
      longitude: -58.38,
    });

    assert.equal(created.clientId, null);
  });

  it("creates with an active client from the same company", async () => {
    setupUnitTestEnv();
    const { clientRepository } = await import("../repositories/client.repository");
    const { companyLocationTypesService } = await import("./company-location-types.service");
    const { locationZoneService } = await import("./location-zone.service");
    const { serviceRepository } = await import("../repositories/service.repository");
    const { serviceService } = await import("./service.service");
    const clientId = "11111111-1111-4111-8111-111111111111";

    mock.method(clientRepository, "findById", async (companyId, id) => {
      assert.equal(companyId, "company-1");
      assert.equal(id, clientId);
      return {
        id: clientId,
        companyId,
        name: "Cliente activo",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: null,
        updatedBy: null,
      };
    });
    mock.method(companyLocationTypesService, "assertActiveServiceFormat", async () => undefined);
    mock.method(locationZoneService, "findOrCreateByNameLocality", async () => null);
    mock.method(serviceRepository, "findByCompanyAndName", async () => null);
    mock.method(serviceRepository, "create", async (_companyId, input) => ({
      ...sampleService,
      clientId: input.clientId ?? null,
    }));

    const created = await serviceService.create("company-1", {
      name: "Sucursal con cliente",
      latitude: -34.6,
      longitude: -58.38,
      clientId,
    });

    assert.equal(created.clientId, clientId);
  });

  it("rejects a missing or cross-company client", async () => {
    setupUnitTestEnv();
    const { clientRepository } = await import("../repositories/client.repository");
    const { serviceService } = await import("./service.service");

    mock.method(clientRepository, "findById", async (companyId) => {
      assert.equal(companyId, "company-1");
      return null;
    });

    await assert.rejects(
      () =>
        serviceService.create("company-1", {
          name: "Sucursal inválida",
          latitude: -34.6,
          longitude: -58.38,
          clientId: "22222222-2222-4222-8222-222222222222",
        }),
      (error: unknown) => error instanceof AppError && error.code === "CLIENT_NOT_FOUND",
    );
  });

  it("rejects an inactive client", async () => {
    setupUnitTestEnv();
    const { clientRepository } = await import("../repositories/client.repository");
    const { serviceService } = await import("./service.service");

    mock.method(clientRepository, "findById", async () => ({
      id: "33333333-3333-4333-8333-333333333333",
      companyId: "company-1",
      name: "Cliente inactivo",
      isActive: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: null,
      updatedBy: null,
    }));

    await assert.rejects(
      () =>
        serviceService.create("company-1", {
          name: "Sucursal inválida",
          latitude: -34.6,
          longitude: -58.38,
          clientId: "33333333-3333-4333-8333-333333333333",
        }),
      (error: unknown) => error instanceof AppError && error.code === "CLIENT_INACTIVE",
    );
  });

  it("preserves an omitted client, unlinks null, and accepts an active replacement on update", async () => {
    setupUnitTestEnv();
    const { clientRepository } = await import("../repositories/client.repository");
    const { companyLocationTypesService } = await import("./company-location-types.service");
    const { serviceRepository } = await import("../repositories/service.repository");
    const { serviceService } = await import("./service.service");
    const assignedClientId = "44444444-4444-4444-8444-444444444444";
    const replacementClientId = "55555555-5555-4555-8555-555555555555";
    const existing = { ...sampleService, clientId: assignedClientId };

    mock.method(serviceRepository, "findById", async () => existing);
    mock.method(companyLocationTypesService, "assertActiveServiceFormat", async () => undefined);
    mock.method(serviceRepository, "findByCompanyAndNameExcludingId", async () => null);
    mock.method(clientRepository, "findById", async (companyId, clientId) => {
      assert.equal(companyId, "company-1");
      assert.equal(clientId, replacementClientId);
      return {
        id: replacementClientId,
        companyId,
        name: "Cliente B",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: null,
        updatedBy: null,
      };
    });
    mock.method(serviceRepository, "update", async (_companyId, _id, input) => ({
      ...existing,
      clientId: input.clientId === undefined ? existing.clientId : input.clientId,
    }));

    const preserved = await serviceService.update("company-1", existing.id, { name: "Nuevo nombre" });
    const unlinked = await serviceService.update("company-1", existing.id, { clientId: null });
    const replaced = await serviceService.update("company-1", existing.id, { clientId: replacementClientId });

    assert.equal(preserved.clientId, assignedClientId);
    assert.equal(unlinked.clientId, null);
    assert.equal(replaced.clientId, replacementClientId);
  });
});

describe("serviceService name uniqueness per company", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("rejects create when same company already has the name", async () => {
    setupUnitTestEnv();
    const { companyLocationTypesService } = await import("./company-location-types.service");
    const { serviceRepository } = await import("../repositories/service.repository");
    const { serviceService } = await import("./service.service");

    mock.method(companyLocationTypesService, "assertActiveServiceFormat", async () => undefined);
    mock.method(serviceRepository, "findByCompanyAndName", async (companyId, name) => {
      assert.equal(companyId, "company-a");
      assert.equal(name, "Central");
      return { ...sampleService, id: "other-service", name: "Central" };
    });

    await assert.rejects(
      () =>
        serviceService.create("company-a", {
          name: " Central ",
          latitude: -34.6,
          longitude: -58.38,
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 409 &&
        error.code === "SERVICE_NAME_ALREADY_EXISTS",
    );
  });

  it("allows create when name exists only in another company", async () => {
    setupUnitTestEnv();
    const { companyLocationTypesService } = await import("./company-location-types.service");
    const { locationZoneService } = await import("./location-zone.service");
    const { serviceRepository } = await import("../repositories/service.repository");
    const { serviceService } = await import("./service.service");

    mock.method(companyLocationTypesService, "assertActiveServiceFormat", async () => undefined);
    mock.method(locationZoneService, "findOrCreateByNameLocality", async () => null);
    mock.method(serviceRepository, "findByCompanyAndName", async (companyId) => {
      assert.equal(companyId, "company-b");
      return null;
    });
    mock.method(serviceRepository, "create", async (companyId, input) => ({
      ...sampleService,
      id: "service-b",
      name: input.name,
    }));

    const created = await serviceService.create("company-b", {
      name: "Central",
      latitude: -34.6,
      longitude: -58.38,
    });
    assert.equal(created.name, "Central");
  });

  it("maps SQL duplicate key race on create to SERVICE_NAME_ALREADY_EXISTS", async () => {
    setupUnitTestEnv();
    const { companyLocationTypesService } = await import("./company-location-types.service");
    const { locationZoneService } = await import("./location-zone.service");
    const { serviceRepository } = await import("../repositories/service.repository");
    const { serviceService } = await import("./service.service");

    mock.method(companyLocationTypesService, "assertActiveServiceFormat", async () => undefined);
    mock.method(locationZoneService, "findOrCreateByNameLocality", async () => null);
    mock.method(serviceRepository, "findByCompanyAndName", async () => null);
    mock.method(serviceRepository, "create", async () => {
      throw Object.assign(
        new Error(
          "Cannot insert duplicate key row with unique index 'UQ_operational_locations_company_id_name'",
        ),
        { number: 2601 },
      );
    });

    await assert.rejects(
      () =>
        serviceService.create("company-a", {
          name: "Central",
          latitude: -34.6,
          longitude: -58.38,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "SERVICE_NAME_ALREADY_EXISTS",
    );
  });

  it("allows update when keeping the same name", async () => {
    setupUnitTestEnv();
    const { serviceRepository } = await import("../repositories/service.repository");
    const { serviceService } = await import("./service.service");

    mock.method(serviceRepository, "findById", async () => sampleService);
    mock.method(serviceRepository, "findByCompanyAndNameExcludingId", async () => null);
    mock.method(serviceRepository, "update", async (_companyId, _id, input) => ({
      ...sampleService,
      name: input.name ?? sampleService.name,
    }));

    const updated = await serviceService.update("company-1", sampleService.id, {
      name: sampleService.name,
    });
    assert.equal(updated.name, sampleService.name);
  });

  it("rejects update when another service in the same company already has the name", async () => {
    setupUnitTestEnv();
    const { serviceRepository } = await import("../repositories/service.repository");
    const { serviceService } = await import("./service.service");

    mock.method(serviceRepository, "findById", async () => sampleService);
    mock.method(
      serviceRepository,
      "findByCompanyAndNameExcludingId",
      async (companyId, name, excludeId) => {
        assert.equal(companyId, "company-1");
        assert.equal(name, "Central");
        assert.equal(excludeId, sampleService.id);
        return { ...sampleService, id: "other-service", name: "Central" };
      },
    );

    await assert.rejects(
      () =>
        serviceService.update("company-1", sampleService.id, {
          name: "Central",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "SERVICE_NAME_ALREADY_EXISTS",
    );
  });

  it("maps SQL duplicate key race on update to SERVICE_NAME_ALREADY_EXISTS", async () => {
    setupUnitTestEnv();
    const { serviceRepository } = await import("../repositories/service.repository");
    const { serviceService } = await import("./service.service");

    mock.method(serviceRepository, "findById", async () => sampleService);
    mock.method(serviceRepository, "findByCompanyAndNameExcludingId", async () => null);
    mock.method(serviceRepository, "update", async () => {
      throw Object.assign(
        new Error(
          "Violation of UNIQUE KEY constraint 'UQ_operational_locations_company_id_name'",
        ),
        { number: 2627 },
      );
    });

    await assert.rejects(
      () =>
        serviceService.update("company-1", sampleService.id, {
          name: "Central",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "SERVICE_NAME_ALREADY_EXISTS",
    );
  });
});
