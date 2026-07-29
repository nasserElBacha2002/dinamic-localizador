import type { PaginatedResponse } from "../types/api";
import type {
  AcceptInvitationInput,
  AcceptInvitationResult,
  CompanyInvitationCreateResult,
  CreateCompanyInvitationInput,
  UserInvitationFilters,
  UserInvitationPreview,
  UserInvitationSummary,
} from "../types/user-invitation";
import { apiClient } from "./client";
import { scopedApiClient } from "./scoped-client";

export async function previewInvitation(token: string): Promise<UserInvitationPreview> {
  const { data } = await apiClient.get<{ data: UserInvitationPreview }>("invitations/preview", {
    params: { token },
  });
  return data.data;
}

export async function acceptInvitation(input: AcceptInvitationInput) {
  const { data } = await apiClient.post<{
    data: AcceptInvitationResult;
    message: string;
    invitationAccepted: boolean;
  }>("invitations/accept", input);
  return data;
}

export async function declineInvitation(token: string) {
  const { data } = await apiClient.post<{
    data: { companyId: string; status: string; declined: boolean };
    message: string;
  }>("invitations/decline", { token });
  return data;
}

export async function listCompanyInvitations(filters: UserInvitationFilters = {}) {
  const { data } = await scopedApiClient.get<PaginatedResponse<UserInvitationSummary>>(
    "invitations",
    { params: filters },
  );
  return data;
}

export async function createCompanyInvitation(input: CreateCompanyInvitationInput) {
  const { data } = await scopedApiClient.post<{
    data: CompanyInvitationCreateResult;
    message: string;
  }>("invitations", input);
  return data;
}

export async function resendCompanyInvitation(invitationId: string) {
  const { data } = await scopedApiClient.post<{
    data: Pick<CompanyInvitationCreateResult, "id" | "email" | "status" | "expiresAt" | "emailSent">;
    message: string;
  }>(`invitations/${invitationId}/resend`);
  return data;
}

export async function revokeCompanyInvitation(invitationId: string) {
  const { data } = await scopedApiClient.post<{ message: string }>(
    `invitations/${invitationId}/revoke`,
  );
  return data;
}
