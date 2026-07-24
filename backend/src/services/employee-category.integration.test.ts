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
import { deleteCompanyCascade } from "../test-helpers/integration-cleanup";
import { employeeCategoryRepository } from "../repositories/employee-category.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { employeeCategoryService } from "./employee-category.service";
import { employeeDeactivationService } from "./employee-deactivation.service";
import { employeeService } from "./employee.service";
import { platformCompanyService } from "./platform-company.service";

const uniqueSuffix = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const uniquePhone = (seed: number): string =>
  `+54911${String(Date.now()).slice(-5)}${String(seed).padStart(3, "0")}${Math.floor(Math.random() * 90 + 10)}`;

describeDatabaseIntegration("employee categories multi-company and sorting", () => {
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

  it("keeps system seed stable across company creation (not a migration idempotency check)", async () => {
    const systemCountBefore = await employeeCategoryRepository.countSystemCategories();
    assert.equal(systemCountBefore, 5);

    const suffix = uniqueSuffix();
    const ownerEmail = `cat-seed-${suffix}@integration.test`;
    createdUserEmails.push(ownerEmail);

    const company = await platformCompanyService.createCompany({
      name: `Cat Seed ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Owner Seed",
        email: ownerEmail,
        temporaryPassword: "password123",
      },
    });
    createdCompanyIds.push(company.data.company.id);

    const systemCountAfter = await employeeCategoryRepository.countSystemCategories();
    assert.equal(systemCountAfter, 5);
  });

  it("isolates customs, rejects foreign assign, preserves inactive historical, clears null", async () => {
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
      phoneNumber: uniquePhone(1),
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
          phoneNumber: uniquePhone(2),
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
          phoneNumber: uniquePhone(3),
          employeeType: "fijo",
          categoryId: created.id,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "EMPLOYEE_CATEGORY_INVALID",
    );

    const historical = await employeeRepository.findById(companyA.data.company.id, employee.id);
    assert.equal(historical?.category?.name, "Auditor");
    assert.equal(historical?.category?.isActive, false);

    const keptHistorical = await employeeService.update(companyA.data.company.id, employee.id, {
      name: "Colaborador Cat Renamed",
      categoryId: created.id,
    });
    assert.equal(keptHistorical.categoryId, created.id);
    assert.equal(keptHistorical.category?.isActive, false);

    const cleared = await employeeService.update(companyA.data.company.id, employee.id, {
      categoryId: null,
    });
    assert.equal(cleared.categoryId, null);
    assert.equal(cleared.category, null);

    const withSystem = await employeeService.update(companyA.data.company.id, employee.id, {
      categoryId: systemCategory.id,
    });
    assert.equal(withSystem.category?.name, "Operario");
  });

  it("rejects raw SQL cross-company category assignment via DB trigger", async () => {
    const suffix = uniqueSuffix();
    const ownerEmailA = `cat-trig-a-${suffix}@integration.test`;
    const ownerEmailB = `cat-trig-b-${suffix}@integration.test`;
    createdUserEmails.push(ownerEmailA, ownerEmailB);

    const companyA = await platformCompanyService.createCompany({
      name: `Cat Trig A ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Owner A",
        email: ownerEmailA,
        temporaryPassword: "password123",
      },
    });
    const companyB = await platformCompanyService.createCompany({
      name: `Cat Trig B ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Owner B",
        email: ownerEmailB,
        temporaryPassword: "password123",
      },
    });
    createdCompanyIds.push(companyA.data.company.id, companyB.data.company.id);

    const foreignCategory = await employeeCategoryService.create(companyB.data.company.id, "OWNER", {
      name: `Trig Foreign ${suffix}`,
    });

    await assert.rejects(
      () =>
        getPool()
          .request()
          .input("companyId", sql.UniqueIdentifier, companyA.data.company.id)
          .input("categoryId", sql.UniqueIdentifier, foreignCategory.id)
          .input("phone", sql.NVarChar(30), uniquePhone(40))
          .query(`
            INSERT INTO employees (company_id, name, document_number, phone_number, employee_type, category_id)
            VALUES (@companyId, N'Trig Bypass', NULL, @phone, N'fijo', @categoryId)
          `),
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        return /EMPLOYEE_CATEGORY_CROSS_COMPANY|50051/.test(message);
      },
    );
  });

  it("rejects assignment when category is inactive at write time (conditional INSERT)", async () => {
    const suffix = uniqueSuffix();
    const ownerEmail = `cat-atomic-${suffix}@integration.test`;
    createdUserEmails.push(ownerEmail);

    const company = await platformCompanyService.createCompany({
      name: `Cat Atomic ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Owner Atomic",
        email: ownerEmail,
        temporaryPassword: "password123",
      },
    });
    createdCompanyIds.push(company.data.company.id);

    const category = await employeeCategoryService.create(company.data.company.id, "OWNER", {
      name: `Atomic ${suffix}`,
    });

    await employeeCategoryService.update(company.data.company.id, "OWNER", category.id, {
      isActive: false,
    });

    await assert.rejects(
      () =>
        employeeRepository.create(company.data.company.id, {
          name: "Race Assignee",
          documentNumber: null,
          phoneNumber: uniquePhone(50),
          employeeType: "fijo",
          categoryId: category.id,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "EMPLOYEE_CATEGORY_INVALID",
    );

    // Concurrent deactivate vs assign: hold inactive update, then let assign observe it.
    const category2 = await employeeCategoryService.create(company.data.company.id, "OWNER", {
      name: `Atomic2 ${suffix}`,
    });
    const pool = getPool();
    const deactivateTx = new sql.Transaction(pool);
    await deactivateTx.begin();
    await new sql.Request(deactivateTx)
      .input("categoryId", sql.UniqueIdentifier, category2.id)
      .query(`
        UPDATE employee_categories WITH (UPDLOCK, HOLDLOCK)
        SET is_active = 0, updated_at = SYSUTCDATETIME()
        WHERE id = @categoryId
      `);

    const assignPromise = employeeRepository.create(company.data.company.id, {
      name: "Race Assignee 2",
      documentNumber: null,
      phoneNumber: uniquePhone(51),
      employeeType: "fijo",
      categoryId: category2.id,
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    await deactivateTx.commit();

    await assert.rejects(
      () => assignPromise,
      (error: unknown) =>
        error instanceof AppError && error.code === "EMPLOYEE_CATEGORY_INVALID",
    );
  });

  it("sorts employees by category with nulls last, stable id tie-break, and multi-page order", async () => {
    const suffix = uniqueSuffix();
    const ownerEmail = `cat-sort-${suffix}@integration.test`;
    createdUserEmails.push(ownerEmail);

    const company = await platformCompanyService.createCompany({
      name: `Cat Sort ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Owner Sort",
        email: ownerEmail,
        temporaryPassword: "password123",
      },
    });
    const companyId = company.data.company.id;
    createdCompanyIds.push(companyId);

    const catAlpha = await employeeCategoryService.create(companyId, "OWNER", {
      name: "Alpha Cat",
    });
    const catBeta = await employeeCategoryService.create(companyId, "OWNER", {
      name: "Beta Cat",
    });

    const createdEmployees = [];
    createdEmployees.push(
      await employeeService.create(companyId, {
        name: "Zulu Null",
        documentNumber: "900",
        phoneNumber: uniquePhone(60),
        employeeType: "fijo",
        categoryId: null,
      }),
      await employeeService.create(companyId, {
        name: "Mike Beta",
        documentNumber: "200",
        phoneNumber: uniquePhone(61),
        employeeType: "eventual",
        categoryId: catBeta.id,
      }),
      await employeeService.create(companyId, {
        name: "Anna Alpha",
        documentNumber: "100",
        phoneNumber: uniquePhone(62),
        employeeType: "fijo",
        categoryId: catAlpha.id,
      }),
      await employeeService.create(companyId, {
        name: "Bruno Alpha",
        documentNumber: "150",
        phoneNumber: uniquePhone(63),
        employeeType: "fijo",
        categoryId: catAlpha.id,
      }),
      await employeeService.create(companyId, {
        name: "Carla Null",
        documentNumber: null,
        phoneNumber: uniquePhone(64),
        employeeType: "eventual",
        categoryId: null,
      }),
    );

    await employeeDeactivationService.deactivate(companyId, createdEmployees[1]!.id, {
      confirmAffectedRelease: false,
    });

    const byCategoryAsc = await employeeService.list(companyId, {
      page: 1,
      limit: 50,
      sortBy: "category",
      sortDirection: "asc",
    });
    // Null categories last; same-category / null groups are ordered by e.id (NEWID), not name.
    assert.deepEqual(
      byCategoryAsc.data.map((row) => row.category?.name ?? null),
      ["Alpha Cat", "Alpha Cat", "Beta Cat", null, null],
    );
    assert.deepEqual(
      new Set(
        byCategoryAsc.data
          .filter((row) => row.category?.name === "Alpha Cat")
          .map((row) => row.name),
      ),
      new Set(["Anna Alpha", "Bruno Alpha"]),
    );
    assert.deepEqual(
      new Set(byCategoryAsc.data.filter((row) => row.category == null).map((row) => row.name)),
      new Set(["Carla Null", "Zulu Null"]),
    );
    const byCategoryAscAgain = await employeeService.list(companyId, {
      page: 1,
      limit: 50,
      sortBy: "category",
      sortDirection: "asc",
    });
    assert.deepEqual(
      byCategoryAscAgain.data.map((row) => row.id),
      byCategoryAsc.data.map((row) => row.id),
      "category sort must be stable across pages/queries",
    );

    const byCategoryDesc = await employeeService.list(companyId, {
      page: 1,
      limit: 50,
      sortBy: "category",
      sortDirection: "desc",
    });
    assert.deepEqual(
      byCategoryDesc.data.map((row) => row.category?.name ?? null),
      ["Beta Cat", "Alpha Cat", "Alpha Cat", null, null],
    );

    const byNameAsc = await employeeService.list(companyId, {
      page: 1,
      limit: 50,
      sortBy: "name",
      sortDirection: "asc",
    });
    assert.deepEqual(
      byNameAsc.data.map((row) => row.name),
      ["Anna Alpha", "Bruno Alpha", "Carla Null", "Mike Beta", "Zulu Null"],
    );

    const byDocumentDesc = await employeeService.list(companyId, {
      page: 1,
      limit: 50,
      sortBy: "documentNumber",
      sortDirection: "desc",
    });
    assert.deepEqual(
      byDocumentDesc.data.map((row) => row.documentNumber),
      ["900", "200", "150", "100", null],
    );

    const byPhoneAsc = await employeeService.list(companyId, {
      page: 1,
      limit: 50,
      sortBy: "phoneNumber",
      sortDirection: "asc",
    });
    const phones = byPhoneAsc.data.map((row) => row.phoneNumber);
    for (let index = 1; index < phones.length; index += 1) {
      assert.ok(
        phones[index - 1]! <= phones[index]!,
        `phone sort not ascending at ${index}: ${phones[index - 1]} > ${phones[index]}`,
      );
    }

    const byTypeAsc = await employeeService.list(companyId, {
      page: 1,
      limit: 50,
      sortBy: "employeeType",
      sortDirection: "asc",
    });
    for (let index = 1; index < byTypeAsc.data.length; index += 1) {
      assert.ok(
        byTypeAsc.data[index - 1]!.employeeType <= byTypeAsc.data[index]!.employeeType,
        "employeeType sort must be ascending",
      );
    }

    const byActiveDesc = await employeeService.list(companyId, {
      page: 1,
      limit: 50,
      sortBy: "active",
      sortDirection: "desc",
    });
    assert.equal(byActiveDesc.data[0]?.active, true);
    assert.equal(byActiveDesc.data.at(-1)?.active, false);

    const page1 = await employeeService.list(companyId, {
      page: 1,
      limit: 2,
      sortBy: "name",
      sortDirection: "asc",
    });
    const page2 = await employeeService.list(companyId, {
      page: 2,
      limit: 2,
      sortBy: "name",
      sortDirection: "asc",
    });
    const page3 = await employeeService.list(companyId, {
      page: 3,
      limit: 2,
      sortBy: "name",
      sortDirection: "asc",
    });
    assert.deepEqual(
      [...page1.data, ...page2.data, ...page3.data].map((row) => row.name),
      ["Anna Alpha", "Bruno Alpha", "Carla Null", "Mike Beta", "Zulu Null"],
    );
    assert.equal(page1.meta.total, 5);
    assert.equal(page1.meta.totalPages, 3);

    const filtered = await employeeService.list(companyId, {
      page: 1,
      limit: 50,
      search: "Alpha",
      active: true,
      categoryId: catAlpha.id,
      sortBy: "name",
      sortDirection: "asc",
    });
    assert.deepEqual(
      filtered.data.map((row) => row.name),
      ["Anna Alpha", "Bruno Alpha"],
    );

    const noneList = await employeeService.list(companyId, {
      page: 1,
      limit: 50,
      categoryId: "none",
      sortBy: "name",
      sortDirection: "asc",
    });
    assert.deepEqual(
      noneList.data.map((row) => row.name),
      ["Carla Null", "Zulu Null"],
    );
  });
});
