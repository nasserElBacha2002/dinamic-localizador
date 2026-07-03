import {
  ALL_COMPANY_MODULE_KEYS,
  CORE_COMPANY_MODULE_KEYS,
  type CompanyModuleKey,
} from "../constants/company-modules";
import { AppError } from "../errors/app-error";
import { companyModuleRepository } from "../repositories/company-module.repository";
import { companyRepository } from "../repositories/company.repository";
import type { UpdateCompanyModulesInput } from "../schemas/company-module.schema";
import type { CompanyModule, CompanyModuleDto } from "../types/company";

const toCompanyModuleDto = (module: CompanyModule): CompanyModuleDto => ({
  companyId: module.companyId,
  moduleKey: module.moduleKey as CompanyModuleKey,
  isEnabled: module.isEnabled,
  createdAt: module.createdAt,
  updatedAt: module.updatedAt,
});

const mergeWithDefaults = (
  companyId: string,
  modules: CompanyModule[],
): CompanyModuleDto[] => {
  const byKey = new Map(modules.map((module) => [module.moduleKey, module]));
  // Defensive fallback only: ensureDefaults runs before listModules in normal flows.
  const syntheticTimestamp = new Date(0).toISOString();

  return ALL_COMPANY_MODULE_KEYS.map((moduleKey) => {
    const existing = byKey.get(moduleKey);
    if (existing) {
      return toCompanyModuleDto(existing);
    }

    return {
      companyId,
      moduleKey,
      isEnabled: true,
      createdAt: syntheticTimestamp,
      updatedAt: syntheticTimestamp,
    };
  });
};

const assertActiveCompany = async (companyId: string): Promise<void> => {
  const company = await companyRepository.findById(companyId);
  if (!company || company.status !== "ACTIVE") {
    throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
  }
};

const assertCoreModuleEnabled = (enabledByKey: Map<string, boolean>): void => {
  const hasCoreEnabled = CORE_COMPANY_MODULE_KEYS.some((moduleKey) => enabledByKey.get(moduleKey) === true);

  if (!hasCoreEnabled) {
    throw new AppError(
      400,
      "CORE_MODULES_REQUIRED",
      "Debe quedar habilitado al menos un módulo operativo.",
    );
  }
};

export const companyModuleService = {
  async listModules(companyId: string): Promise<CompanyModuleDto[]> {
    await assertActiveCompany(companyId);
    await companyModuleRepository.ensureDefaults(companyId);
    const modules = await companyModuleRepository.listByCompanyId(companyId);
    return mergeWithDefaults(companyId, modules);
  },

  async getModuleStates(companyId: string): Promise<Map<CompanyModuleKey, boolean>> {
    const modules = await this.listModules(companyId);
    return new Map(modules.map((module) => [module.moduleKey, module.isEnabled]));
  },

  async updateModules(
    companyId: string,
    isPlatformAdmin: boolean,
    input: UpdateCompanyModulesInput,
  ): Promise<CompanyModuleDto[]> {
    if (!isPlatformAdmin) {
      throw new AppError(
        403,
        "PLATFORM_ADMIN_REQUIRED",
        "Solo un administrador de plataforma puede gestionar módulos.",
      );
    }

    await assertActiveCompany(companyId);
    const currentModules = await this.listModules(companyId);
    const mergedStates = new Map(
      currentModules.map((module) => [module.moduleKey, module.isEnabled]),
    );
    for (const module of input.modules) {
      mergedStates.set(module.moduleKey, module.isEnabled);
    }
    assertCoreModuleEnabled(mergedStates);
    await companyModuleRepository.bulkSet(companyId, input.modules);
    return this.listModules(companyId);
  },

  async ensureDefaultModules(companyId: string): Promise<void> {
    await assertActiveCompany(companyId);
    await companyModuleRepository.ensureDefaults(companyId);
  },
};
