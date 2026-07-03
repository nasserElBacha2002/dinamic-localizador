import sql from "mssql";
import { DEFAULT_COMPANY_MODULE_KEYS } from "../constants/company-modules";
import { toCompanySettingsInput } from "../constants/company-settings";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { companyModuleRepository } from "../repositories/company-module.repository";
import { companyRepository } from "../repositories/company.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
import { userRepository } from "../repositories/user.repository";
import type { CreatePlatformCompanyInput } from "../schemas/platform-company.schema";
import { companyAbsenceSettingsService } from "./company-absence-settings.service";
import { companyLocationTypesService } from "./company-location-types.service";
import { hashPassword, normalizeEmail } from "../utils/password";
import { isDuplicateKeyError } from "../utils/sql-server-errors";

export const platformCompanyService = {
  async listCompanies() {
    return companyRepository.listActive();
  },

  async createCompany(input: CreatePlatformCompanyInput) {
    const existingCompany = await companyRepository.findByName(input.name.trim());
    if (existingCompany) {
      throw new AppError(
        409,
        "COMPANY_NAME_ALREADY_EXISTS",
        "Ya existe una empresa con ese nombre.",
      );
    }

    const email = normalizeEmail(input.owner.email);
    const existingOwner = await userRepository.findByEmail(email);
    if (!existingOwner && !input.owner.temporaryPassword) {
      throw new AppError(
        400,
        "TEMPORARY_PASSWORD_REQUIRED",
        "La contraseña temporal es obligatoria para crear un usuario owner nuevo.",
      );
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const company = await companyRepository.create(
        {
          name: input.name.trim(),
          defaultTimezone: input.defaultTimezone,
          status: input.status,
        },
        transaction,
      );

      const defaultSettings = toCompanySettingsInput();

      const settingsInput = {
        ...defaultSettings,
        ...input.settings,
        operationTimezone:
          input.settings?.operationTimezone ??
          input.defaultTimezone ??
          defaultSettings.operationTimezone,
      };

      await companySettingsRepository.create(company.id, settingsInput, transaction);

      await companyAbsenceSettingsService.ensureAbsenceCatalogForCompany(company.id, transaction);
      await companyLocationTypesService.ensureLocationTypesCatalogForCompany(company.id, transaction);

      const moduleKeys = [
        ...new Set(input.modules?.length ? input.modules : DEFAULT_COMPANY_MODULE_KEYS),
      ];
      await companyModuleRepository.bulkEnable(company.id, moduleKeys, transaction);

      let ownerUser = existingOwner;
      if (!ownerUser) {
        const passwordHash = await hashPassword(input.owner.temporaryPassword!);
        ownerUser = await userRepository.create(
          {
            name: input.owner.name.trim(),
            email,
            passwordHash,
            role: "ADMIN",
          },
          transaction,
        );
      }

      const existingMembership = await userCompanyMembershipRepository.findMembership(
        ownerUser.id,
        company.id,
      );
      if (existingMembership) {
        throw new AppError(
          409,
          "MEMBERSHIP_ALREADY_EXISTS",
          "El usuario owner ya tiene membresía en esta empresa.",
        );
      }

      const shouldSetDefault = !(await userCompanyMembershipRepository.userHasDefaultMembership(
        ownerUser.id,
      ));

      const membership = await userCompanyMembershipRepository.create(
        {
          userId: ownerUser.id,
          companyId: company.id,
          role: "OWNER",
          status: "ACTIVE",
          isDefault: shouldSetDefault,
        },
        transaction,
      );

      await transaction.commit();

      return {
        data: {
          company: {
            id: company.id,
            name: company.name,
            status: company.status,
            defaultTimezone: company.defaultTimezone,
          },
          owner: {
            userId: ownerUser.id,
            name: ownerUser.name,
            email: ownerUser.email,
            companyRole: membership.role,
            membershipStatus: membership.status,
          },
          message:
            "Empresa creada. Compartí la contraseña temporal que ingresaste con el usuario owner si era un usuario nuevo.",
        },
      };
    } catch (error) {
      await transaction.rollback();
      if (isDuplicateKeyError(error)) {
        throw new AppError(
          409,
          "COMPANY_NAME_ALREADY_EXISTS",
          "Ya existe una empresa con ese nombre.",
        );
      }
      throw error;
    }
  },
};
