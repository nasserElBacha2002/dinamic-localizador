import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const activeCompany = {
  id: "company-1",
  name: "Co",
  legalName: null,
  taxId: null,
  country: null,
  defaultTimezone: "America/Argentina/Buenos_Aires",
  status: "ACTIVE" as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const expressType = {
  id: "type-1",
  companyId: "company-1",
  code: "EXPRESS",
  name: "Express",
  isActive: true,
  sortOrder: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const warehouseType = {
  id: "type-2",
  companyId: "company-1",
  code: "WAREHOUSE",
  name: "Warehouse",
  isActive: true,
  sortOrder: 2,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("companyLocationTypesService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("lists only active types when activeOnly is true", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyLocationTypesRepository } = await import(
      "../repositories/company-location-types.repository"
    );
    const { companyLocationTypesService } = await import("./company-location-types.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(companyLocationTypesRepository, "ensureLegacyTypesForCompany", async () => undefined);
    mock.method(companyLocationTypesRepository, "listByCompanyId", async (_companyId, activeOnly) =>
      activeOnly ? [expressType] : [expressType, { ...warehouseType, isActive: false }],
    );

    const activeOnly = await companyLocationTypesService.listLocationTypes("company-1", true);
    const all = await companyLocationTypesService.listLocationTypes("company-1", false);

    assert.equal(activeOnly.length, 1);
    assert.equal(all.length, 2);
  });

  it("rejects duplicate explicit code on create before insert", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyLocationTypesRepository } = await import(
      "../repositories/company-location-types.repository"
    );
    const { companyLocationTypesService } = await import("./company-location-types.service");

    let createCalls = 0;
    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(companyLocationTypesRepository, "listByCompanyId", async () => [expressType]);
    mock.method(companyLocationTypesRepository, "findByCode", async () => expressType);
    mock.method(companyLocationTypesRepository, "create", async () => {
      createCalls += 1;
      return expressType;
    });

    await assert.rejects(
      () =>
        companyLocationTypesService.createLocationType("company-1", "OWNER", {
          name: "Another Express",
          code: "EXPRESS",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "LOCATION_TYPE_CODE_ALREADY_EXISTS",
    );
    assert.equal(createCalls, 0);
  });

  it("rejects duplicate generated code from name on create", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyLocationTypesRepository } = await import(
      "../repositories/company-location-types.repository"
    );
    const { companyLocationTypesService } = await import("./company-location-types.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(companyLocationTypesRepository, "listByCompanyId", async () => [warehouseType]);
    mock.method(companyLocationTypesRepository, "findByCode", async () => warehouseType);

    await assert.rejects(
      () =>
        companyLocationTypesService.createLocationType("company-1", "OWNER", {
          name: "Warehouse",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "LOCATION_TYPE_CODE_ALREADY_EXISTS",
    );
  });

  it("allows same code in different companies", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyLocationTypesRepository } = await import(
      "../repositories/company-location-types.repository"
    );
    const { companyLocationTypesService } = await import("./company-location-types.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(companyLocationTypesRepository, "listByCompanyId", async () => []);
    mock.method(companyLocationTypesRepository, "findByCode", async () => null);
    mock.method(companyLocationTypesRepository, "create", async (_companyId, input) => ({
      ...expressType,
      code: input.code,
      name: input.name,
    }));

    const created = await companyLocationTypesService.createLocationType("company-1", "OWNER", {
      name: "Express",
      code: "EXPRESS",
    });
    assert.equal(created.code, "EXPRESS");
  });

  it("updates name and sortOrder without changing code", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyLocationTypesRepository } = await import(
      "../repositories/company-location-types.repository"
    );
    const { companyLocationTypesService } = await import("./company-location-types.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(companyLocationTypesRepository, "findById", async () => expressType);
    mock.method(companyLocationTypesRepository, "update", async (_companyId, _id, input) => ({
      ...expressType,
      name: input.name ?? expressType.name,
      sortOrder: input.sortOrder ?? expressType.sortOrder,
    }));

    const updated = await companyLocationTypesService.updateLocationType(
      "company-1",
      "OWNER",
      expressType.id,
      { name: "Express updated", sortOrder: 5 },
    );

    assert.equal(updated.code, "EXPRESS");
    assert.equal(updated.name, "Express updated");
    assert.equal(updated.sortOrder, 5);
  });

  it("rejects update to another existing code in same company", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyLocationTypesRepository } = await import(
      "../repositories/company-location-types.repository"
    );
    const { companyLocationTypesService } = await import("./company-location-types.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(companyLocationTypesRepository, "findById", async () => expressType);
    mock.method(companyLocationTypesRepository, "findByCode", async () => warehouseType);

    await assert.rejects(
      () =>
        companyLocationTypesService.updateLocationType("company-1", "OWNER", expressType.id, {
          code: "WAREHOUSE",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "LOCATION_TYPE_CODE_ALREADY_EXISTS",
    );
  });

  it("soft-disables a type", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyLocationTypesRepository } = await import(
      "../repositories/company-location-types.repository"
    );
    const { companyLocationTypesService } = await import("./company-location-types.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(companyLocationTypesRepository, "findById", async () => expressType);
    mock.method(companyLocationTypesRepository, "update", async () => ({
      ...expressType,
      isActive: false,
    }));

    const disabled = await companyLocationTypesService.disableLocationType(
      "company-1",
      "OWNER",
      expressType.id,
    );
    assert.equal(disabled.isActive, false);
  });

  it("rejects inactive location type for store assignment", async () => {
    setupUnitTestEnv();
    const { companyLocationTypesRepository } = await import(
      "../repositories/company-location-types.repository"
    );
    const { companyLocationTypesService } = await import("./company-location-types.service");

    mock.method(companyLocationTypesRepository, "ensureLegacyTypesForCompany", async () => undefined);
    mock.method(companyLocationTypesRepository, "findByCode", async () => ({
      ...expressType,
      isActive: false,
    }));

    await assert.rejects(
      () => companyLocationTypesService.assertActiveStoreFormat("company-1", "EXPRESS"),
      (error: unknown) => error instanceof AppError && error.code === "INACTIVE_LOCATION_TYPE",
    );
  });
});
