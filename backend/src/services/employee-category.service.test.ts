import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { employeeCategoryRepository } from "../repositories/employee-category.repository";
import { companyRepository } from "../repositories/company.repository";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { employeeCategoryService } from "./employee-category.service";

setupUnitTestEnv();

describe("employeeCategoryService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("lists system and company categories for the active company", async () => {
    mock.method(companyRepository, "findById", async () => ({
      id: "company-a",
      status: "ACTIVE",
    }));
    mock.method(employeeCategoryRepository, "listForCompany", async () => [
      {
        id: "sys-1",
        companyId: null,
        name: "Auxiliar",
        normalizedName: "auxiliar",
        isSystem: true,
        isActive: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "custom-1",
        companyId: "company-a",
        name: "Auditor",
        normalizedName: "auditor",
        isSystem: false,
        isActive: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const result = await employeeCategoryService.list("company-a", { includeInactive: false });
    assert.equal(result.length, 2);
    assert.equal(result[0].isSystem, true);
  });

  it("rejects custom names that collide with system categories", async () => {
    mock.method(companyRepository, "findById", async () => ({
      id: "company-a",
      status: "ACTIVE",
    }));
    mock.method(employeeCategoryRepository, "findByNormalizedName", async () => ({
      id: "sys-1",
      companyId: null,
      name: "Auxiliar",
      normalizedName: "auxiliar",
      isSystem: true,
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }));

    await assert.rejects(
      () =>
        employeeCategoryService.create("company-a", "OWNER", {
          name: "auxiliar",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "EMPLOYEE_CATEGORY_NAME_COLLIDES_WITH_SYSTEM",
    );
  });

  it("rejects updating system categories", async () => {
    mock.method(companyRepository, "findById", async () => ({
      id: "company-a",
      status: "ACTIVE",
    }));
    mock.method(employeeCategoryRepository, "findByIdForCompany", async () => ({
      id: "sys-1",
      companyId: null,
      name: "Auxiliar",
      normalizedName: "auxiliar",
      isSystem: true,
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }));

    await assert.rejects(
      () =>
        employeeCategoryService.update("company-a", "OWNER", "sys-1", {
          name: "Otro",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "EMPLOYEE_CATEGORY_SYSTEM_IMMUTABLE",
    );
  });

  it("rejects inactive categories for new assignment", async () => {
    mock.method(employeeCategoryRepository, "findAssignableById", async () => null);

    await assert.rejects(
      () => employeeCategoryService.assertAssignableCategory("company-a", "inactive-1"),
      (error: unknown) =>
        error instanceof AppError && error.code === "EMPLOYEE_CATEGORY_INVALID",
    );
  });
});
