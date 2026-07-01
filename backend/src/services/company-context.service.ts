import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { companyRepository } from "../repositories/company.repository";
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
import type { Company, UserCompanyMembership } from "../types/company";
import { buildPlatformAdminMembership } from "../utils/platform-admin-membership";

export interface BotDefaultCompanyOptions {
  defaultCompanyId?: string;
  defaultCompanyName?: string;
}

export const selectDefaultBotCompanyId = (
  activeCompanies: Pick<Company, "id" | "name">[],
  options: BotDefaultCompanyOptions,
): string => {
  if (options.defaultCompanyId) {
    const configured = activeCompanies.find((company) => company.id === options.defaultCompanyId);
    if (!configured) {
      throw new AppError(
        503,
        "BOT_DEFAULT_COMPANY_INVALID",
        "La empresa configurada en BOT_DEFAULT_COMPANY_ID no existe o no está activa.",
      );
    }
    return configured.id;
  }

  if (options.defaultCompanyName) {
    const normalizedName = options.defaultCompanyName.toLowerCase();
    const configured = activeCompanies.find(
      (company) => company.name.toLowerCase() === normalizedName,
    );
    if (!configured) {
      throw new AppError(
        503,
        "BOT_DEFAULT_COMPANY_INVALID",
        "La empresa configurada en BOT_DEFAULT_COMPANY_NAME no existe o no está activa.",
      );
    }
    return configured.id;
  }

  if (activeCompanies.length === 1) {
    return activeCompanies[0].id;
  }

  throw new AppError(
    503,
    "BOT_COMPANY_SELECTION_REQUIRED",
    "Hay varias empresas activas. Configurá BOT_DEFAULT_COMPANY_ID o BOT_DEFAULT_COMPANY_NAME.",
  );
};

export const companyContextService = {
  async resolveDefaultCompanyId(): Promise<string> {
    const activeCompanies = await companyRepository.listActive();
    return selectDefaultBotCompanyId(activeCompanies, {
      defaultCompanyId: env.BOT_DEFAULT_COMPANY_ID,
      defaultCompanyName: env.BOT_DEFAULT_COMPANY_NAME,
    });
  },

  async resolveLegacyCompanyContext(
    userId: string,
    isPlatformAdmin = false,
  ): Promise<{
    company: Company;
    membership: UserCompanyMembership;
  }> {
    if (isPlatformAdmin) {
      const activeCompanies = await companyRepository.listActive();

      if (activeCompanies.length === 0) {
        throw new AppError(
          403,
          "NO_COMPANY_MEMBERSHIP",
          "No hay empresas activas disponibles.",
        );
      }

      if (activeCompanies.length > 1) {
        throw new AppError(
          409,
          "COMPANY_SELECTION_REQUIRED",
          "Seleccioná una empresa activa o usá rutas con /api/companies/:companyId.",
        );
      }

      const company = activeCompanies[0];
      return {
        company,
        membership: buildPlatformAdminMembership(userId, company.id),
      };
    }

    const memberships = await userCompanyMembershipRepository.listActiveForUser(userId);

    if (memberships.length === 0) {
      throw new AppError(
        403,
        "NO_COMPANY_MEMBERSHIP",
        "El usuario no pertenece a ninguna empresa activa.",
      );
    }

    if (memberships.length > 1) {
      throw new AppError(
        409,
        "COMPANY_SELECTION_REQUIRED",
        "Seleccioná una empresa activa o usá rutas con /api/companies/:companyId.",
      );
    }

    const membership = await userCompanyMembershipRepository.findActiveMembership(
      userId,
      memberships[0].companyId,
    );

    if (!membership) {
      throw new AppError(403, "NO_COMPANY_MEMBERSHIP", "Membresía de empresa no válida.");
    }

    const company = await companyRepository.findById(membership.companyId);
    if (!company || company.status !== "ACTIVE") {
      throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
    }

    return { company, membership };
  },

  async resolveCompanyContext(
    userId: string,
    companyId?: string,
    options: { isPlatformAdmin?: boolean } = {},
  ): Promise<{ company: Company; membership: UserCompanyMembership }> {
    const isPlatformAdmin = Boolean(options.isPlatformAdmin);

    if (companyId) {
      const company = await companyRepository.findById(companyId);
      if (!company || company.status !== "ACTIVE") {
        throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
      }

      if (isPlatformAdmin) {
        return {
          company,
          membership: buildPlatformAdminMembership(userId, companyId),
        };
      }

      const membership = await userCompanyMembershipRepository.findActiveMembership(
        userId,
        companyId,
      );

      if (!membership) {
        throw new AppError(
          403,
          "COMPANY_ACCESS_DENIED",
          "No tiene acceso a la empresa solicitada.",
        );
      }

      return { company, membership };
    }

    return this.resolveLegacyCompanyContext(userId, isPlatformAdmin);
  },
};
