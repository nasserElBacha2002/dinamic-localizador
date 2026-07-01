export type UserRole = "ADMIN";

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isPlatformAdmin: boolean;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

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
