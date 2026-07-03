import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const activeCompany = {
  id: "company-1",
  name: "Dinamic Systems",
  legalName: null,
  taxId: null,
  country: null,
  defaultTimezone: "America/Argentina/Buenos_Aires",
  status: "ACTIVE" as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const absenceTypes = [
  {
    id: "type-vacation",
    companyId: "company-1",
    code: "VACATION",
    name: "Vacaciones",
    description: null,
    requiresApproval: true,
    requiresAttachment: false,
    deductsBalance: true,
    allowsHalfDay: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "type-study",
    companyId: "company-1",
    code: "STUDY_DAY",
    name: "Día de estudio",
    description: null,
    requiresApproval: true,
    requiresAttachment: false,
    deductsBalance: true,
    allowsHalfDay: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "type-sick",
    companyId: "company-1",
    code: "SICK_LEAVE",
    name: "Enfermedad",
    description: null,
    requiresApproval: true,
    requiresAttachment: false,
    deductsBalance: false,
    allowsHalfDay: false,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const companySettings = [
  {
    id: "s1",
    companyId: "company-1",
    absenceTypeCode: "VACATION",
    defaultAnnualDays: 14,
    autoAssignOnEmployeeCreate: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "s2",
    companyId: "company-1",
    absenceTypeCode: "STUDY_DAY",
    defaultAnnualDays: 2.5,
    autoAssignOnEmployeeCreate: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "s3",
    companyId: "company-1",
    absenceTypeCode: "SICK_LEAVE",
    defaultAnnualDays: 5,
    autoAssignOnEmployeeCreate: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const activeEmployee = {
  id: "employee-1",
  companyId: "company-1",
  name: "Existing Employee",
  documentNumber: null,
  phoneNumber: "+5491100000001",
  employeeType: "FIELD" as const,
  active: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastWorkedAt: null,
};

describe("employeeAbsenceBalanceBackfillService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  const setupCommonMocks = async (options?: {
    existingBalanceTypeIds?: string[];
    inactiveTypeCodes?: string[];
  }) => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyAbsenceSettingsService } = await import("./company-absence-settings.service");
    const { companyAbsenceSettingsRepository } = await import(
      "../repositories/company-absence-settings.repository"
    );
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { absenceTypeRepository } = await import("../repositories/absence-type.repository");
    const { absenceBalanceRepository } = await import("../repositories/absence-balance.repository");
    const { employeeAbsenceBalanceBackfillService } = await import(
      "./employee-absence-balance-backfill.service"
    );

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(companyRepository, "listActive", async () => [activeCompany]);
    mock.method(companyAbsenceSettingsService, "ensureAbsenceCatalogForCompany", async () => undefined);
    mock.method(companyAbsenceSettingsRepository, "listByCompanyId", async () => companySettings);
    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      operationTimezone: "America/Argentina/Buenos_Aires",
    }));
    mock.method(employeeRepository, "listActiveByCompanyId", async () => [activeEmployee]);
    mock.method(absenceTypeRepository, "findByCode", async (_companyId, code) => {
      const type = absenceTypes.find((row) => row.code === code) ?? null;
      if (!type) {
        return null;
      }
      if (options?.inactiveTypeCodes?.includes(code)) {
        return { ...type, isActive: false };
      }
      return type;
    });

    const createdKeys: string[] = [];
    mock.method(absenceBalanceRepository, "findByEmployeeTypeYear", async (_companyId, _employeeId, typeId) => {
      if (options?.existingBalanceTypeIds?.includes(typeId)) {
        return {
          id: `balance-${typeId}`,
          companyId: "company-1",
          employeeId: "employee-1",
          absenceTypeId: typeId,
          year: 2026,
          totalDays: 99,
          usedDays: 0,
          notes: "manual",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
      return null;
    });
    mock.method(absenceBalanceRepository, "createIfNotExists", async (_companyId, input) => {
      createdKeys.push(`${input.employeeId}:${input.absenceTypeId}:${input.year}:${input.totalDays}`);
      return {
        id: `created-${input.absenceTypeId}`,
        companyId: "company-1",
        employeeId: input.employeeId,
        absenceTypeId: input.absenceTypeId,
        year: input.year,
        totalDays: input.totalDays,
        usedDays: 0,
        notes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

    return { employeeAbsenceBalanceBackfillService, createdKeys };
  };

  it("creates missing balances for existing employees", async () => {
    const { employeeAbsenceBalanceBackfillService, createdKeys } = await setupCommonMocks();

    const result = await employeeAbsenceBalanceBackfillService.backfillCompany("company-1", { year: 2026 });

    assert.equal(result.balancesCreated, 2);
    assert.equal(result.existingBalancesSkipped, 0);
    assert.equal(result.ineligibleAbsenceTypesSkipped, 1);
    assert.equal(createdKeys.length, 2);
    assert.ok(createdKeys.some((key) => key.endsWith(":2.5")));
  });

  it("does not overwrite existing balances", async () => {
    const { employeeAbsenceBalanceBackfillService, createdKeys } = await setupCommonMocks({
      existingBalanceTypeIds: ["type-vacation"],
    });

    const result = await employeeAbsenceBalanceBackfillService.backfillCompany("company-1", { year: 2026 });

    assert.equal(result.balancesCreated, 1);
    assert.equal(result.existingBalancesSkipped, 1);
    assert.equal(createdKeys.length, 1);
    assert.ok(createdKeys.every((key) => key.includes("type-study")));
  });

  it("is idempotent on second run", async () => {
    const { employeeAbsenceBalanceBackfillService } = await setupCommonMocks({
      existingBalanceTypeIds: ["type-vacation", "type-study"],
    });

    const result = await employeeAbsenceBalanceBackfillService.backfillCompany("company-1", { year: 2026 });

    assert.equal(result.balancesCreated, 0);
    assert.equal(result.existingBalancesSkipped, 2);
  });

  it("respects autoAssignOnEmployeeCreate = false", async () => {
    const { employeeAbsenceBalanceBackfillService, createdKeys } = await setupCommonMocks();

    const result = await employeeAbsenceBalanceBackfillService.backfillCompany("company-1", { year: 2026 });

    assert.equal(result.ineligibleAbsenceTypesSkipped, 1);
    assert.ok(createdKeys.every((key) => !key.includes("type-sick")));
  });

  it("skips inactive absence types", async () => {
    const { employeeAbsenceBalanceBackfillService, createdKeys } = await setupCommonMocks({
      inactiveTypeCodes: ["VACATION"],
    });

    const result = await employeeAbsenceBalanceBackfillService.backfillCompany("company-1", { year: 2026 });

    assert.equal(result.balancesCreated, 1);
    assert.equal(result.ineligibleAbsenceTypesSkipped, 2);
    assert.ok(createdKeys.every((key) => key.includes("type-study")));
  });

  it("preserves decimal days like 2.5", async () => {
    const { employeeAbsenceBalanceBackfillService, createdKeys } = await setupCommonMocks();

    await employeeAbsenceBalanceBackfillService.backfillCompany("company-1", { year: 2026 });

    assert.ok(createdKeys.some((key) => key.endsWith(":2.5")));
  });

  it("supports dry-run without writing", async () => {
    const { employeeAbsenceBalanceBackfillService, createdKeys } = await setupCommonMocks();

    const result = await employeeAbsenceBalanceBackfillService.backfillCompany("company-1", {
      year: 2026,
      dryRun: true,
    });

    assert.equal(result.balancesCreated, 2);
    assert.equal(createdKeys.length, 0);
  });

  it("supports specific companyId", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { employeeAbsenceBalanceBackfillService } = await import(
      "./employee-absence-balance-backfill.service"
    );

    let listActiveCalls = 0;
    mock.method(companyRepository, "findById", async (id: string) =>
      id === "company-1" ? activeCompany : null,
    );
    mock.method(companyRepository, "listActive", async () => {
      listActiveCalls += 1;
      return [activeCompany];
    });

    const { companyAbsenceSettingsService } = await import("./company-absence-settings.service");
    const { companyAbsenceSettingsRepository } = await import(
      "../repositories/company-absence-settings.repository"
    );
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { absenceTypeRepository } = await import("../repositories/absence-type.repository");
    const { absenceBalanceRepository } = await import("../repositories/absence-balance.repository");

    mock.method(companyAbsenceSettingsService, "ensureAbsenceCatalogForCompany", async () => undefined);
    mock.method(companyAbsenceSettingsRepository, "listByCompanyId", async () => companySettings);
    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      operationTimezone: "America/Argentina/Buenos_Aires",
    }));
    mock.method(employeeRepository, "listActiveByCompanyId", async () => [activeEmployee]);
    mock.method(absenceTypeRepository, "findByCode", async (_companyId, code) =>
      absenceTypes.find((row) => row.code === code) ?? null,
    );
    mock.method(absenceBalanceRepository, "findByEmployeeTypeYear", async () => null);
    mock.method(absenceBalanceRepository, "createIfNotExists", async () => null);

    await employeeAbsenceBalanceBackfillService.backfillAllCompanies({ companyId: "company-1", year: 2026 });

    assert.equal(listActiveCalls, 0);
  });

  it("uses provided year when passed", async () => {
    const { employeeAbsenceBalanceBackfillService, createdKeys } = await setupCommonMocks();

    const result = await employeeAbsenceBalanceBackfillService.backfillCompany("company-1", { year: 2024 });

    assert.equal(result.year, 2024);
    assert.ok(createdKeys.every((key) => key.includes(":2024:")));
  });

  it("defaults year from company timezone when year is not passed", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyAbsenceSettingsService } = await import("./company-absence-settings.service");
    const { companyAbsenceSettingsRepository } = await import(
      "../repositories/company-absence-settings.repository"
    );
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { absenceTypeRepository } = await import("../repositories/absence-type.repository");
    const { absenceBalanceRepository } = await import("../repositories/absence-balance.repository");
    const { employeeAbsenceBalanceBackfillService } = await import(
      "./employee-absence-balance-backfill.service"
    );
    const { getCurrentYearInTimezone } = await import("../utils/operational-year");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(companyAbsenceSettingsService, "ensureAbsenceCatalogForCompany", async () => undefined);
    mock.method(companyAbsenceSettingsRepository, "listByCompanyId", async () => companySettings.slice(0, 1));
    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      operationTimezone: "America/Argentina/Buenos_Aires",
    }));
    mock.method(employeeRepository, "listActiveByCompanyId", async () => [activeEmployee]);
    mock.method(absenceTypeRepository, "findByCode", async () => absenceTypes[0]);
    mock.method(absenceBalanceRepository, "findByEmployeeTypeYear", async () => null);

    const createdYears: number[] = [];
    mock.method(absenceBalanceRepository, "createIfNotExists", async (_companyId, input) => {
      createdYears.push(input.year);
      return null;
    });

    const expectedYear = getCurrentYearInTimezone("America/Argentina/Buenos_Aires");
    const result = await employeeAbsenceBalanceBackfillService.backfillCompany("company-1");

    assert.equal(result.year, expectedYear);
    assert.deepEqual(createdYears, [expectedYear]);
  });

  it("rejects unknown companyId", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { employeeAbsenceBalanceBackfillService } = await import(
      "./employee-absence-balance-backfill.service"
    );

    mock.method(companyRepository, "findById", async () => null);

    await assert.rejects(
      () => employeeAbsenceBalanceBackfillService.backfillAllCompanies({ companyId: "missing-company" }),
      (error: unknown) => error instanceof AppError && error.code === "COMPANY_NOT_FOUND",
    );
  });
});
