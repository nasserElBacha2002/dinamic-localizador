export type PlatformCompanyStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "SUSPENDED"
  | "PENDING_DELETION"
  | "DELETING"
  | "DELETED"
  | "DELETION_FAILED";

export interface PlatformCompany {
  id: string;
  name: string;
  defaultTimezone: string;
  status: PlatformCompanyStatus | string;
  createdAt: string;
  updatedAt: string;
  deactivatedAt?: string | null;
  deactivationReason?: string | null;
  scheduledDeletionAt?: string | null;
  deletionStartedAt?: string | null;
  deletionAttempts?: number;
  deletionLastError?: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerStatus: "ACTIVE" | "INVITED" | "NONE";
}

export interface PlatformCompanyLifecycle {
  companyId: string;
  name: string;
  status: string;
  deactivatedAt: string | null;
  deactivatedByUserId: string | null;
  deactivationReason: string | null;
  scheduledDeletionAt: string | null;
  reactivatedAt: string | null;
  reactivatedByUserId: string | null;
  deletionStartedAt: string | null;
  deletedAt: string | null;
  deletionAttempts: number;
  deletionLastError: string | null;
  gracePeriodDays: number;
  daysRemaining: number | null;
}

export interface CreatePlatformCompanyInput {
  name: string;
  defaultTimezone: string;
  status?: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  settings?: {
    operationTimezone?: string;
    defaultRadiusMeters?: number;
    lateGraceMinutes?: number;
    earlyLeaveToleranceMinutes?: number;
    requireCheckoutLocation?: boolean;
    allowManualAttendanceCorrections?: boolean;
    defaultEarlyArrivalToleranceMinutes?: number;
    defaultLateArrivalToleranceMinutes?: number;
    defaultOperationStartTime?: string | null;
    defaultOperationEndTime?: string | null;
    geofenceReviewMarginMeters?: number | null;
  };
  modules?: Array<
    "attendance" | "operations" | "absences" | "reports" | "bot_simulator"
  >;
  owner: {
    name: string;
    email: string;
  };
}

export interface PlatformCompanyCreateResult {
  data: {
    company: {
      id: string;
      name: string;
      status: string;
      defaultTimezone: string;
    };
    ownerInvitation: {
      id: string;
      email: string;
      status: string;
      expiresAt: string;
      emailSent: boolean;
    };
    message: string;
  };
}
