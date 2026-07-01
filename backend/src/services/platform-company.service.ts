import sql from "mssql";
import { DEFAULT_COMPANY_MODULE_KEYS } from "../constants/company-modules";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { companyModuleRepository } from "../repositories/company-module.repository";
import { companyRepository } from "../repositories/company.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
import { userRepository } from "../repositories/user.repository";
import type { CreatePlatformCompanyInput } from "../schemas/platform-company.schema";
import { hashPassword, normalizeEmail } from "../utils/password";

const DEFAULT_SETTINGS = {
  operationTimezone: "America/Argentina/Buenos_Aires",
  defaultRadiusMeters: 150,
  lateGraceMinutes: 15,
  earlyLeaveToleranceMinutes: 15,
  requireCheckoutLocation: true,
  allowManualAttendanceCorrections: true,
};

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

      const settingsInput = {
        ...DEFAULT_SETTINGS,
        ...input.settings,
        operationTimezone:
          input.settings?.operationTimezone ??
          input.defaultTimezone ??
          DEFAULT_SETTINGS.operationTimezone,
      };

      await companySettingsRepository.create(company.id, settingsInput, transaction);

      const moduleKeys = input.modules?.length ? input.modules : DEFAULT_COMPANY_MODULE_KEYS;
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
      throw error;
    }
  },
};
