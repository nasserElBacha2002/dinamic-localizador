import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { STANDARD_ABSENCE_TYPE_CODES } from "../constants/company-absence";
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

const absenceTypes = STANDARD_ABSENCE_TYPE_CODES.map((code, index) => ({
  id: `type-${index}`,
  companyId: "company-1",
  code,
  name: code,
  description: null,
  requiresApproval: true,
  requiresAttachment: false,
  deductsBalance: code === "VACATION",
  allowsHalfDay: code === "STUDY_DAY",
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));

describe("companyAbsenceSettingsService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("OWNER can read absence settings with catalog ensure", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { absenceTypeRepository } = await import("../repositories/absence-type.repository");
    const { companyAbsenceSettingsRepository } = await import(
      "../repositories/company-absence-settings.repository"
    );
    const { companyAbsenceSettingsService } = await import("./company-absence-settings.service");

    let ensureTypesCalls = 0;
    let ensureSettingsCalls = 0;

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(absenceTypeRepository, "ensureStandardTypesForCompany", async () => {
      ensureTypesCalls += 1;
    });
    mock.method(companyAbsenceSettingsRepository, "ensureDefaultSettingsForCompany", async () => {
      ensureSettingsCalls += 1;
    });
    mock.method(absenceTypeRepository, "listAll", async () => absenceTypes);
    mock.method(companyAbsenceSettingsRepository, "listByCompanyId", async () => [
      {
        id: "setting-1",
        companyId: "company-1",
        absenceTypeCode: "VACATION",
        defaultAnnualDays: 14,
        autoAssignOnEmployeeCreate: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const settings = await companyAbsenceSettingsService.getCompanyAbsenceSettings("company-1");
    assert.equal(ensureTypesCalls, 1);
    assert.equal(ensureSettingsCalls, 1);
    assert.ok(settings.some((row) => row.absenceTypeCode === "VACATION" && row.defaultAnnualDays === 14));
  });

  it("rejects unknown absence type on update", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { absenceTypeRepository } = await import("../repositories/absence-type.repository");
    const { companyAbsenceSettingsRepository } = await import(
      "../repositories/company-absence-settings.repository"
    );
    const { companyAbsenceSettingsService } = await import("./company-absence-settings.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(absenceTypeRepository, "ensureStandardTypesForCompany", async () => undefined);
    mock.method(companyAbsenceSettingsRepository, "ensureDefaultSettingsForCompany", async () => undefined);
    mock.method(absenceTypeRepository, "findByCode", async () => null);

    await assert.rejects(
      () =>
        companyAbsenceSettingsService.updateCompanyAbsenceSettings("company-1", "OWNER", {
          settings: [
            {
              absenceTypeCode: "UNKNOWN",
              defaultAnnualDays: 1,
              autoAssignOnEmployeeCreate: false,
            },
          ],
        }),
      (error: unknown) => error instanceof AppError && error.code === "UNKNOWN_ABSENCE_TYPE",
    );
  });

  it("READ_ONLY cannot update absence settings", async () => {
    setupUnitTestEnv();
    const { companyAbsenceSettingsService } = await import("./company-absence-settings.service");

    await assert.rejects(
      () =>
        companyAbsenceSettingsService.updateCompanyAbsenceSettings("company-1", "READ_ONLY", {
          settings: [
            {
              absenceTypeCode: "VACATION",
              defaultAnnualDays: 10,
              autoAssignOnEmployeeCreate: true,
            },
          ],
        }),
      (error: unknown) => error instanceof AppError && error.code === "FORBIDDEN",
    );
  });

  it("initializes balances only for auto-assign settings on active types", async () => {
    setupUnitTestEnv();
    const { absenceTypeRepository } = await import("../repositories/absence-type.repository");
    const { companyAbsenceSettingsRepository } = await import(
      "../repositories/company-absence-settings.repository"
    );
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { absenceBalanceRepository } = await import("../repositories/absence-balance.repository");
    const { companyAbsenceSettingsService } = await import("./company-absence-settings.service");

    const createdBalances: Array<{ absenceTypeId: string; totalDays: number }> = [];

    mock.method(absenceTypeRepository, "ensureStandardTypesForCompany", async () => undefined);
    mock.method(companyAbsenceSettingsRepository, "ensureDefaultSettingsForCompany", async () => undefined);
    mock.method(companyAbsenceSettingsRepository, "listByCompanyId", async () => [
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
        defaultAnnualDays: 0,
        autoAssignOnEmployeeCreate: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      operationTimezone: "America/Argentina/Buenos_Aires",
    }));
    mock.method(absenceTypeRepository, "findByCode", async (_companyId, code) => {
      if (code === "SICK_LEAVE") {
        return { ...absenceTypes[2], isActive: false };
      }
      return absenceTypes.find((type) => type.code === code) ?? null;
    });
    mock.method(absenceBalanceRepository, "createIfNotExists", async (_companyId, input) => {
      createdBalances.push({
        absenceTypeId: input.absenceTypeId,
        totalDays: input.totalDays,
      });
      return null;
    });

    await companyAbsenceSettingsService.initializeEmployeeAbsenceBalances("company-1", "employee-1");

    assert.equal(createdBalances.length, 2);
    assert.ok(createdBalances.some((row) => row.absenceTypeId === "type-0" && row.totalDays === 14));
    assert.ok(createdBalances.some((row) => row.absenceTypeId === "type-1" && row.totalDays === 2.5));
  });

  it("passes transaction to createIfNotExists when provided", async () => {
    setupUnitTestEnv();
    const { absenceTypeRepository } = await import("../repositories/absence-type.repository");
    const { companyAbsenceSettingsRepository } = await import(
      "../repositories/company-absence-settings.repository"
    );
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { absenceBalanceRepository } = await import("../repositories/absence-balance.repository");
    const { companyAbsenceSettingsService } = await import("./company-absence-settings.service");

    const fakeTransaction = { id: "tx-1" } as import("mssql").Transaction;

    mock.method(companyAbsenceSettingsRepository, "listByCompanyId", async () => [
      {
        id: "s1",
        companyId: "company-1",
        absenceTypeCode: "VACATION",
        defaultAnnualDays: 14,
        autoAssignOnEmployeeCreate: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      operationTimezone: "America/Argentina/Buenos_Aires",
    }));
    mock.method(absenceTypeRepository, "findByCode", async () => absenceTypes[0]);
    mock.method(absenceBalanceRepository, "createIfNotExists", async (_companyId, _input, tx) => {
      assert.equal(tx, fakeTransaction);
      return null;
    });

    await companyAbsenceSettingsService.initializeEmployeeAbsenceBalances(
      "company-1",
      "employee-1",
      fakeTransaction,
    );
  });
});
