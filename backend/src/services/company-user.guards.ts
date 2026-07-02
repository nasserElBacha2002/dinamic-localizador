import { AppError } from "../errors/app-error";
import type { CompanyMembershipStatus, CompanyRole, UserCompanyMembership } from "../types/company";
import type { UpdateCompanyUserInput } from "../schemas/company-user.schema";

export const assertSelfMembershipChangeNotAllowed = (
  targetUserId: string,
  requesterUserId: string,
  requesterIsPlatformAdmin: boolean,
  input: UpdateCompanyUserInput,
  existing: Pick<UserCompanyMembership, "role" | "status">,
): void => {
  if (requesterIsPlatformAdmin || targetUserId !== requesterUserId) {
    return;
  }

  const changingRole = input.role !== undefined && input.role !== existing.role;
  const deactivating = input.status === "INACTIVE";

  if (changingRole || deactivating) {
    throw new AppError(
      403,
      "SELF_MEMBERSHIP_CHANGE_NOT_ALLOWED",
      "No podés modificar tu propio acceso desde esta pantalla.",
    );
  }
};

export const isLastOwnerDemotion = (
  existingRole: CompanyRole,
  existingStatus: CompanyMembershipStatus,
  nextRole: CompanyRole | undefined,
  nextStatus: CompanyMembershipStatus | undefined,
): boolean => {
  if (existingRole !== "OWNER" || existingStatus !== "ACTIVE") {
    return false;
  }

  const deactivating = nextStatus === "INACTIVE";
  const demoting = nextRole !== undefined && nextRole !== "OWNER";
  return deactivating || demoting;
};
