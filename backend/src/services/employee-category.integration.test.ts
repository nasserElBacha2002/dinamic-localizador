import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { AppError } from "../errors/app-error";
import { getPool } from "../database/connection";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { employeeCategoryRepository } from "../repositories/employee-category.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { employeeCategoryService } from "./employee-category.service";
import { employeeService } from "./employee.service";
import { platformCompanyService } from "./platform-company.service";

const uniqueSuffix = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const deleteCompanyCascade = async (companyId: string): Promise<void> => {
  const pool = getPool();
  await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
    DELETE FROM employee_absence_balances WHERE company_id = @companyId;
    DELETE FROM employees WHERE company_id = @companyId;
    DELETE FROM employee_categories WHERE company_id = @companyId;
    DELETE FROM company_absence_settings WHERE company_id = @companyId;
    DELETE FROM absence_types WHERE company_id = @companyId;
    DELETE FROM company_location_types WHERE company_id = @companyId;
    DELETE FROM user_company_memberships WHERE company_id = @companyId;
    DELETE FROM company_modules WHERE company_id = @companyId;
    DELETE FROM company_settings WHERE company_id = @companyId;
    DELETE FROM companies WHERE id = @companyId;
  `);
};

describeDatabaseIntegration("employee categories multi-company", () => {
  const createdCompanyIds: string[] = [];
  const createdUserEmails: string[] = [];

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  after(async () => {
    for (const companyId of createdCompanyIds.splice(0)) {
      await deleteCompanyCascade(companyId);
    }
    for (const email of createdUserEmails.splice(0)) {
      await getPool()
        .request()
        .input("email", sql.NVarChar(255), email)
        .query(`DELETE FROM users WHERE email = @email`);
    }
    await teardownDatabaseIntegration();
  });

  it("seeds system categories idempotently and isolates company customs", async () => {
    const systemCountBefore = await employeeCategoryRepository.countSystemCategories();
    assert.ok(systemCountBefore >= 5, "expects at least five system categories");

    const suffix = uniqueSuffix();
    const ownerEmailA = `cat-a-${suffix}@integration.test`;
    const ownerEmailB = `cat-b-${suffix}@integration.test`;
    createdUserEmails.push(ownerEmailA, ownerEmailB);

    const companyA = await platformCompanyService.createCompany({
      name: `Cat Co A ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Owner A",
        email: ownerEmailA,
        temporaryPassword: "password123",
      },
    });
    const companyB = await platformCompanyService.createCompany({
      name: `Cat Co B ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Owner B",
        email: ownerEmailB,
        temporaryPassword: "password123",
      },
    });
    createdCompanyIds.push(companyA.data.company.id, companyB.data.company.id);

    const systemCountAfter = await employeeCategoryRepository.countSystemCategories();
    assert.equal(systemCountAfter, systemCountBefore);

    const listedA = await employeeCategoryService.list(companyA.data.company.id, {
      includeInactive: false,
    });
    const systemNames = listedA.filter((row) => row.isSystem).map((row) => row.name).sort();
    assert.deepEqual(systemNames, [
      "Auxiliar",
      "Contador",
      "Encargado",
      "Operario",
      "Supervisor",
    ]);

    const created = await employeeCategoryService.create(companyA.data.company.id, "OWNER", {
      name: "Auditor",
    });
    assert.equal(created.isSystem, false);
    assert.equal(created.companyId, companyA.data.company.id);

    await assert.rejects(
      () =>
        employeeCategoryService.create(companyA.data.company.id, "OWNER", {
          name: "  AUDITOR ",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "EMPLOYEE_CATEGORY_NAME_ALREADY_EXISTS",
    );

    await assert.rejects(
      () =>
        employeeCategoryService.create(companyA.data.company.id, "OWNER", {
          name: "auxiliar",
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "EMPLOYEE_CATEGORY_NAME_COLLIDES_WITH_SYSTEM",
    );

    const listedB = await employeeCategoryService.list(companyB.data.company.id, {
      includeInactive: false,
    });
    assert.equal(
      listedB.some((row) => row.id === created.id),
      false,
      "company B must not see company A custom categories",
    );

    const systemCategory = listedA.find((row) => row.name === "Operario");
    assert.ok(systemCategory);

    const employee = await employeeService.create(companyA.data.company.id, {
      name: "Colaborador Cat",
      documentNumber: null,
      phoneNumber: `+54911${String(Date.now()).slice(-8)}`,
      employeeType: "fijo",
      categoryId: created.id,
    });
    assert.equal(employee.categoryId, created.id);
    assert.equal(employee.category?.name, "Auditor");

    await assert.rejects(
      () =>
        employeeService.create(companyB.data.company.id, {
          name: "Foreign assign",
          documentNumber: null,
          phoneNumber: `+54911${String(Date.now() + 1).slice(-8)}`,
          employeeType: "fijo",
          categoryId: created.id,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "EMPLOYEE_CATEGORY_INVALID",
    );

    await employeeCategoryService.update(companyA.data.company.id, "OWNER", created.id, {
      isActive: false,
    });

    await assert.rejects(
      () =>
        employeeService.create(companyA.data.company.id, {
          name: "Inactive assign",
          documentNumber: null,
          phoneNumber: `+54911${String(Date.now() + 2).slice(-8)}`,
          employeeType: "fijo",
          categoryId: created.id,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "EMPLOYEE_CATEGORY_INVALID",
    );

    const historical = await employeeRepository.findById(companyA.data.company.id, employee.id);
    assert.equal(historical?.category?.name, "Auditor");
    assert.equal(historical?.category?.isActive, false);

    const noneList = await employeeService.list(companyA.data.company.id, {
      page: 1,
      limit: 20,
      categoryId: "none",
      sortBy: "name",
      sortDirection: "asc",
    });
    assert.equal(noneList.data.some((row) => row.id === employee.id), false);

    const filtered = await employeeService.list(companyA.data.company.id, {
      page: 1,
      limit: 20,
      categoryId: created.id,
      sortBy: "category",
      sortDirection: "asc",
    });
    assert.equal(filtered.data.some((row) => row.id === employee.id), true);

    const withSystem = await employeeService.update(companyA.data.company.id, employee.id, {
      categoryId: systemCategory.id,
    });
    assert.equal(withSystem.category?.name, "Operario");
  });
});
