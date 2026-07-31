import type { CompanyRole } from "./company-user";

export type UserInvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED" | "DECLINED";

export type UserInvitationOrigin = "MANUAL" | "COMPANY_CREATE" | "RESEND" | "ADMIN";

export type InvitationPreviewStatus = "PENDING" | "INVALID";

export type InvitationDeliveryStatus =
  | "SENT"
  | "PENDING"
  | "FAILED"
  | "IN_PROGRESS"
  | "NOT_ATTEMPTED";

export interface UserInvitationPreview {
  companyName: string;
  email: string;
  emailMasked: string;
  role: CompanyRole;
  status: InvitationPreviewStatus;
  expiresAt: string;
  userExists: boolean;
  inviteeName: string | null;
  origin: UserInvitationOrigin;
}

export interface UserInvitationSummary {
  id: string;
  email: string;
  inviteeName: string | null;
  role: CompanyRole;
  status: UserInvitationStatus;
  origin: UserInvitationOrigin;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  lastEmailAttemptAt: string | null;
  deliveryStatus: InvitationDeliveryStatus;
  publicErrorCode: string | null;
  createdAt: string;
  targetUserId: string | null;
}

export interface CompanyInvitationCreateResult {
  id: string;
  email: string;
  role: CompanyRole;
  status: UserInvitationStatus;
  expiresAt: string;
  emailSent: boolean;
}

export interface CompanyUserInvitationResult {
  invitationId: string;
  email: string;
  status: UserInvitationStatus;
  expiresAt: string;
  emailSent: boolean;
}

export interface AcceptInvitationInput {
  token: string;
  name?: string;
  password?: string;
  passwordConfirmation?: string;
}

export interface AcceptInvitationResult {
  companyId: string;
  companyName: string;
  userId: string;
  role: CompanyRole;
  alreadyMember: boolean;
  isNewUser?: boolean;
}

export interface CreateCompanyInvitationInput {
  name?: string;
  email: string;
  role: CompanyRole;
}

export interface UserInvitationFilters {
  page?: number;
  limit?: number;
  status?: UserInvitationStatus;
}
