export const USER_INVITATION_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "EXPIRED",
  "REVOKED",
  "DECLINED",
] as const;
export type UserInvitationStatus = (typeof USER_INVITATION_STATUSES)[number];

export const USER_INVITATION_ORIGINS = ["MANUAL", "COMPANY_CREATE", "RESEND", "ADMIN"] as const;
export type UserInvitationOrigin = (typeof USER_INVITATION_ORIGINS)[number];

export const INVITATION_EMAIL_PUBLIC_ERROR_CODES = [
  "EMAIL_DELIVERY_FAILED",
  "EMAIL_TRANSPORT_DISABLED",
  "EMAIL_CONSOLE_NOT_DELIVERED",
  "EMAIL_SEND_IN_PROGRESS",
] as const;
export type InvitationEmailPublicErrorCode =
  (typeof INVITATION_EMAIL_PUBLIC_ERROR_CODES)[number];

export type InvitationDeliveryStatus = "SENT" | "PENDING" | "FAILED" | "IN_PROGRESS" | "NOT_ATTEMPTED";

export interface UserInvitation {
  id: string;
  companyId: string;
  emailNormalized: string;
  inviteeName: string | null;
  role: string;
  invitedByUserId: string | null;
  targetUserId: string | null;
  tokenHash: string;
  tokenVersion: number;
  status: UserInvitationStatus;
  origin: UserInvitationOrigin;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  lastEmailSentAt: string | null;
  /** Internal SMTP diagnostics — never expose via API. */
  lastEmailError: string | null;
  lastEmailErrorCode: InvitationEmailPublicErrorCode | string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserInvitationPublicPreview {
  companyName: string;
  email: string;
  emailMasked: string;
  role: string;
  status: "PENDING" | "INVALID";
  expiresAt: string;
  userExists: boolean;
  inviteeName: string | null;
  origin: UserInvitationOrigin;
}

export function resolveInvitationDeliveryStatus(
  invitation: Pick<
    UserInvitation,
    "lastEmailSentAt" | "lastEmailErrorCode"
  >,
): InvitationDeliveryStatus {
  if (invitation.lastEmailErrorCode === "EMAIL_SEND_IN_PROGRESS") {
    return "IN_PROGRESS";
  }
  if (invitation.lastEmailSentAt) {
    return "SENT";
  }
  if (invitation.lastEmailErrorCode) {
    return "FAILED";
  }
  return "NOT_ATTEMPTED";
}
