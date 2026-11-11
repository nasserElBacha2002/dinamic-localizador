import { AppError } from "../../errors/app-error";
import { companyUserEmployeeLinkRepository } from "../../repositories/companies/company-user-employee-link.repository";
import { userCompanyMembershipRepository } from "../../repositories/companies/user-company-membership.repository";
import { isEmployeeOperationalChargeHolder } from "../../utils/employees/operational-charge-holder";

export const operationalManagerEligibilityService = {
  async isEligible(companyId: string, userId: string): Promise<boolean> {
    const membership = await userCompanyMembershipRepository.findActiveMembership(userId, companyId);
    if (!membership || membership.role !== "OPERATIONAL_MANAGER") {
      return false;
    }

    const link = await companyUserEmployeeLinkRepository.findByUserId(companyId, userId);
    if (!link) {
      return false;
    }

    return isEmployeeOperationalChargeHolder(companyId, link.employeeId);
  },

  async assertEligible(companyId: string, userId: string): Promise<void> {
    const membership = await userCompanyMembershipRepository.findActiveMembership(userId, companyId);
    if (!membership) {
      throw new AppError(403, "MEMBERSHIP_NOT_FOUND", "No tiene acceso a esta empresa.");
    }
    if (membership.role !== "OPERATIONAL_MANAGER") {
      return;
    }

    const link = await companyUserEmployeeLinkRepository.findByUserId(companyId, userId);
    if (!link) {
      throw new AppError(
        403,
        "OPERATIONAL_MANAGER_LINK_REQUIRED",
        "El encargado operativo debe estar vinculado a un colaborador Encargado.",
      );
    }

    const isHolder = await isEmployeeOperationalChargeHolder(companyId, link.employeeId);
    if (!isHolder) {
      throw new AppError(
        403,
        "OPERATIONAL_MANAGER_INELIGIBLE",
        "El colaborador vinculado ya no tiene la categoría Encargado activa.",
      );
    }
  },
};
