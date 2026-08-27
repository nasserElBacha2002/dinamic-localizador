export const COMPANY_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
  "PENDING_DELETION",
  "DELETING",
  "DELETED",
  "DELETION_FAILED",
] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

/** Statuses allowed when creating a company via platform API. */
export const COMPANY_CREATE_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"] as const;
export type CompanyCreateStatus = (typeof COMPANY_CREATE_STATUSES)[number];

/** Statuses that block operational access for the tenant. */
export const COMPANY_OPERATIONAL_BLOCKED_STATUSES: readonly CompanyStatus[] = [
  "INACTIVE",
  "SUSPENDED",
  "PENDING_DELETION",
  "DELETING",
  "DELETED",
  "DELETION_FAILED",
];

export const isCompanyOperationallyActive = (status: CompanyStatus): boolean =>
  status === "ACTIVE";

export const COMPANY_MEMBERSHIP_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type CompanyMembershipStatus = (typeof COMPANY_MEMBERSHIP_STATUSES)[number];

export const COMPANY_ROLES = [
  "OWNER",
  "ADMIN",
  "HR",
  "SUPERVISOR",
  "OPERATOR",
  "READ_ONLY",
] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];

export interface Company {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  country: string | null;
  defaultTimezone: string;
  status: CompanyStatus;
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
  deletionPurgeStage: string | null;
  deletionNextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserCompanyMembership {
  id: string;
  userId: string;
  companyId: string;
  role: CompanyRole;
  status: CompanyMembershipStatus;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyMembershipSummary {
  companyId: string;
  companyName: string;
  role: CompanyRole;
  isDefault: boolean;
  status: CompanyMembershipStatus;
}

export interface CompanySettings {
  id: string;
  companyId: string;
  operationTimezone: string;
  defaultRadiusMeters: number;
  lateGraceMinutes: number;
  earlyLeaveToleranceMinutes: number;
  requireCheckoutLocation: boolean;
  allowManualAttendanceCorrections: boolean;
  defaultEarlyArrivalToleranceMinutes: number;
  defaultLateArrivalToleranceMinutes: number;
  defaultOperationStartTime: string | null;
  defaultOperationEndTime: string | null;
  geofenceReviewMarginMeters: number | null;
  confirmationReminderEnabled: boolean;
  confirmationReminderHoursBefore: number;
  pendingOperationExpirationHours: number;
  absenceAdvancedCalendarEnabled: boolean;
  absenceBalanceLedgerEnabled: boolean;
  absenceAttachmentsEnabled: boolean;
  absenceOperationalIntegrationEnabled: boolean;
  adminAlertsEnabled: boolean;
  /** UTC frontier: reconciler only considers domain events at/after this instant. */
  adminAlertsEnabledAt: string | null;
  attendanceThresholdAlertsEnabled: boolean;
  attendanceAlertThresholdPercent: number;
  attendanceAlertWindowDays: number;
  attendanceAlertMinimumWorkdays: number;
  attendanceAlertCooldownDays: number;
  /** Bumped on threshold feature/config changes to force rebaseline. */
  attendanceAlertConfigVersion: number;
  createdAt: string;
  updatedAt: string;
}

export type CompanySettingsDto = Omit<CompanySettings, "id">;

export interface CompanyAbsenceSetting {
  id: string;
  companyId: string;
  absenceTypeCode: string;
  defaultAnnualDays: number;
  autoAssignOnEmployeeCreate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyLocationType {
  id: string;
  companyId: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyModule {
  id: string;
  companyId: string;
  moduleKey: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CompanyModuleDto = Omit<CompanyModule, "id"> & {
  moduleKey: import("../constants/company-modules").CompanyModuleKey;
};

export type CompanyPermission =
  | "company:read"
  | "company:settings:update"
  | "users:manage"
  | "employees:read"
  | "employees:manage"
  | "services:read"
  | "services:manage"
  | "operations:read"
  | "operations:manage"
  | "attendance:read"
  | "attendance:review"
  | "attendance:export"
  | "absences:read"
  | "absences:review"
  | "absences:balance:update"
  | "payroll_receipts:read"
  | "payroll_receipts:upload"
  | "payroll_receipts:manage"
  | "payroll_receipts:delete"
  | "payroll_receipts:download"
  | "reports:read"
  | "reports:export"
  | "bot_simulator:use";

export type CompanyScope = {
  companyId: string;
};
