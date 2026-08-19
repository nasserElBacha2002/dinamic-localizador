export type UserRole = "ADMIN";

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isPlatformAdmin: boolean;
  active: boolean;
  tokenVersion: number;
  twoFactorEnabled: boolean;
  twoFactorSecretEncrypted: string | null;
  twoFactorConfirmedAt: string | null;
  twoFactorLastUsedStep: number | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const TWO_FACTOR_USER_DEFAULTS = {
  twoFactorEnabled: false,
  twoFactorSecretEncrypted: null as string | null,
  twoFactorConfirmedAt: null as string | null,
  twoFactorLastUsedStep: null as number | null,
};


export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isPlatformAdmin: boolean;
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  tokenVersion: number;
}

export type LoginResult =
  | {
      requiresTwoFactor: false;
      token: string;
      user: PublicUser;
    }
  | {
      requiresTwoFactor: true;
      challengeToken: string;
    };

export interface TwoFactorSetupResult {
  otpauthUri: string;
  secret: string;
}

export interface TwoFactorStatus {
  enabled: boolean;
  remainingRecoveryCodes: number;
}

export const TWO_FACTOR_CHALLENGE_PURPOSE = "2fa_login" as const;
export const TWO_FACTOR_CHALLENGE_AUDIENCE = "dinamic-2fa-challenge";
export const TWO_FACTOR_CHALLENGE_ISSUER = "dinamic-attendance-2fa";

export interface TwoFactorChallengePayload {
  purpose: typeof TWO_FACTOR_CHALLENGE_PURPOSE;
  userId: string;
  tokenVersion: number;
  challengeId: string;
}

export type OperationalStatus = "NO_CHECK_IN" | "VALID" | "PENDING_REVIEW" | "REJECTED";

export interface AttendanceReview {
  id: string;
  attendanceId: string;
  reviewedBy: string;
  previousValidationStatus: string;
  newValidationStatus: string;
  decision: "APPROVE" | "REJECT";
  reason: string;
  createdAt: string;
  reviewer?: Pick<PublicUser, "id" | "name" | "email">;
}
