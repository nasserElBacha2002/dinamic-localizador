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

const locationType = {
  id: "type-1",
  companyId: "company-1",
  code: "EXPRESS",
  name: "Express",
  isActive: true,
  sortOrder: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("companyLocationTypesService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("rejects duplicate code on create", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyLocationTypesRepository } = await import(
      "../repositories/company-location-types.repository"
    );
    const { companyLocationTypesService } = await import("./company-location-types.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(companyLocationTypesRepository, "listByCompanyId", async () => []);
    mock.method(companyLocationTypesRepository, "findByCode", async () => null);
    mock.method(companyLocationTypesRepository, "create", async () => {
      const error = new Error("duplicate") as Error & { number?: number };
      error.number = 2627;
      throw error;
    });

    await assert.rejects(
      () =>
        companyLocationTypesService.createLocationType("company-1", "OWNER", {
          name: "Express",
          code: "EXPRESS",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "LOCATION_TYPE_CODE_ALREADY_EXISTS",
    );
  });

  it("rejects inactive location type for store assignment", async () => {
    setupUnitTestEnv();
    const { companyLocationTypesRepository } = await import(
      "../repositories/company-location-types.repository"
    );
    const { companyLocationTypesService } = await import("./company-location-types.service");

    mock.method(companyLocationTypesRepository, "ensureStandardTypesForCompany", async () => undefined);
    mock.method(companyLocationTypesRepository, "findByCode", async () => ({
      ...locationType,
      isActive: false,
    }));

    await assert.rejects(
      () => companyLocationTypesService.assertActiveStoreFormat("company-1", "EXPRESS"),
      (error: unknown) => error instanceof AppError && error.code === "INACTIVE_LOCATION_TYPE",
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
      ...locationType,
      code: input.code,
      name: input.name,
    }));

    const created = await companyLocationTypesService.createLocationType("company-1", "OWNER", {
      name: "Express",
      code: "EXPRESS",
    });
    assert.equal(created.code, "EXPRESS");
  });
});
