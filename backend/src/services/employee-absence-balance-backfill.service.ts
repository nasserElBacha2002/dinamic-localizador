import { DEFAULT_COMPANY_OPERATIONAL_SETTINGS } from "../constants/company-settings";
import { AppError } from "../errors/app-error";
import { absenceBalanceRepository } from "../repositories/absence-balance.repository";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import { companyAbsenceSettingsRepository } from "../repositories/company-absence-settings.repository";
import { companyRepository } from "../repositories/company.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { companyAbsenceSettingsService } from "./company-absence-settings.service";
import { getCurrentYearInTimezone } from "../utils/operational-year";

export type EmployeeAbsenceBalanceBackfillOptions = {
  companyId?: string;
  year?: number;
  dryRun?: boolean;
};

export type EmployeeAbsenceBalanceBackfillCompanyResult = {
  companyId: string;
  companyName: string;
  year: number;
  employeesScanned: number;
  balancesCreated: number;
  existingBalancesSkipped: number;
  ineligibleAbsenceTypesSkipped: number;
};

export type EmployeeAbsenceBalanceBackfillSummary = {
  dryRun: boolean;
  companiesProcessed: number;
  employeesScanned: number;
  balancesCreated: number;
  existingBalancesSkipped: number;
  ineligibleAbsenceTypesSkipped: number;
  companyResults: EmployeeAbsenceBalanceBackfillCompanyResult[];
  errors: Array<{ companyId: string; companyName: string; message: string }>;
};

type EmployeeBackfillCounters = {
  balancesCreated: number;
  existingBalancesSkipped: number;
  ineligibleAbsenceTypesSkipped: number;
};

const resolveYearForCompany = async (
  companyId: string,
  explicitYear?: number,
): Promise<number> => {
  if (explicitYear !== undefined) {
    return explicitYear;
  }

  const companySettings = await companySettingsRepository.findByCompanyId(companyId);
  const timezone =
    companySettings?.operationTimezone ?? DEFAULT_COMPANY_OPERATIONAL_SETTINGS.operationTimezone;
  return getCurrentYearInTimezone(timezone);
};

const backfillEmployeeBalances = async (
  companyId: string,
  employeeId: string,
  year: number,
  dryRun: boolean,
): Promise<EmployeeBackfillCounters> => {
  const settings = await companyAbsenceSettingsRepository.listByCompanyId(companyId);
  const counters: EmployeeBackfillCounters = {
    balancesCreated: 0,
    existingBalancesSkipped: 0,
    ineligibleAbsenceTypesSkipped: 0,
  };

  for (const setting of settings) {
    if (!setting.autoAssignOnEmployeeCreate) {
      counters.ineligibleAbsenceTypesSkipped += 1;
      continue;
    }

    const absenceType = await absenceTypeRepository.findByCode(companyId, setting.absenceTypeCode);
    if (!absenceType || !absenceType.isActive) {
      counters.ineligibleAbsenceTypesSkipped += 1;
      continue;
    }

    const existing = await absenceBalanceRepository.findByEmployeeTypeYear(
      companyId,
      employeeId,
      absenceType.id,
      year,
    );

    if (existing) {
      counters.existingBalancesSkipped += 1;
      continue;
    }

    if (dryRun) {
      counters.balancesCreated += 1;
      continue;
    }

    await absenceBalanceRepository.createIfNotExists(companyId, {
      employeeId,
      absenceTypeId: absenceType.id,
      year,
      totalDays: setting.defaultAnnualDays,
      notes: null,
    });
    counters.balancesCreated += 1;
  }

  return counters;
};

export const employeeAbsenceBalanceBackfillService = {
  async backfillCompany(
    companyId: string,
    options: Pick<EmployeeAbsenceBalanceBackfillOptions, "year" | "dryRun"> = {},
  ): Promise<EmployeeAbsenceBalanceBackfillCompanyResult> {
    const dryRun = options.dryRun ?? false;
    const company = await companyRepository.findById(companyId);
    if (!company || company.status !== "ACTIVE") {
      throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
    }

    await companyAbsenceSettingsService.ensureAbsenceCatalogForCompany(companyId);
    const year = await resolveYearForCompany(companyId, options.year);
    const employees = await employeeRepository.listActiveByCompanyId(companyId);

    const result: EmployeeAbsenceBalanceBackfillCompanyResult = {
      companyId,
      companyName: company.name,
      year,
      employeesScanned: employees.length,
      balancesCreated: 0,
      existingBalancesSkipped: 0,
      ineligibleAbsenceTypesSkipped: 0,
    };

    for (const employee of employees) {
      const counters = await backfillEmployeeBalances(companyId, employee.id, year, dryRun);
      result.balancesCreated += counters.balancesCreated;
      result.existingBalancesSkipped += counters.existingBalancesSkipped;
      result.ineligibleAbsenceTypesSkipped += counters.ineligibleAbsenceTypesSkipped;
    }

    return result;
  },

  async backfillAllCompanies(
    options: EmployeeAbsenceBalanceBackfillOptions = {},
  ): Promise<EmployeeAbsenceBalanceBackfillSummary> {
    const dryRun = options.dryRun ?? false;
    const companies = options.companyId
      ? [await companyRepository.findById(options.companyId)].filter(Boolean)
      : await companyRepository.listActive();

    if (options.companyId && companies.length === 0) {
      throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
    }

    const summary: EmployeeAbsenceBalanceBackfillSummary = {
      dryRun,
      companiesProcessed: 0,
      employeesScanned: 0,
      balancesCreated: 0,
      existingBalancesSkipped: 0,
      ineligibleAbsenceTypesSkipped: 0,
      companyResults: [],
      errors: [],
    };

    for (const company of companies) {
      if (!company || company.status !== "ACTIVE") {
        if (options.companyId) {
          throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
        }
        continue;
      }

      try {
        const companyResult = await this.backfillCompany(company.id, {
          year: options.year,
          dryRun,
        });
        summary.companiesProcessed += 1;
        summary.employeesScanned += companyResult.employeesScanned;
        summary.balancesCreated += companyResult.balancesCreated;
        summary.existingBalancesSkipped += companyResult.existingBalancesSkipped;
        summary.ineligibleAbsenceTypesSkipped += companyResult.ineligibleAbsenceTypesSkipped;
        summary.companyResults.push(companyResult);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        summary.errors.push({
          companyId: company.id,
          companyName: company.name,
          message,
        });
      }
    }

    return summary;
  },
};
