import { AppError } from "../errors/app-error";
import { companyRepository } from "../repositories/company.repository";
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
import type { Company, UserCompanyMembership } from "../types/company";

const DEFAULT_COMPANY_NAME = "Dinamic Systems";

export const companyContextService = {
  async resolveDefaultCompanyId(): Promise<string> {
    const activeCompanies = await companyRepository.listActive();

    if (activeCompanies.length === 1) {
      return activeCompanies[0].id;
    }

    const dinamic = await companyRepository.findByName(DEFAULT_COMPANY_NAME);
    if (dinamic) {
      return dinamic.id;
    }

    if (activeCompanies.length > 0) {
      return activeCompanies[0].id;
    }

    throw new AppError(
      500,
      "NO_DEFAULT_COMPANY",
      "No hay una empresa activa configurada para operaciones del bot.",
    );
  },

  async resolveLegacyCompanyContext(userId: string): Promise<{
    company: Company;
    membership: UserCompanyMembership;
  }> {
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
  ): Promise<{ company: Company; membership: UserCompanyMembership }> {
    if (companyId) {
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

      const company = await companyRepository.findById(companyId);
      if (!company || company.status !== "ACTIVE") {
        throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
      }

      return { company, membership };
    }

    return this.resolveLegacyCompanyContext(userId);
  },
};
