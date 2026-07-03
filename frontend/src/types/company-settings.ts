export interface CompanySettings {
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
  createdAt: string;
  updatedAt: string;
}

export type UpdateCompanySettingsInput = Partial<
  Pick<
    CompanySettings,
    | "operationTimezone"
    | "defaultRadiusMeters"
    | "lateGraceMinutes"
    | "earlyLeaveToleranceMinutes"
    | "requireCheckoutLocation"
    | "allowManualAttendanceCorrections"
    | "defaultEarlyArrivalToleranceMinutes"
    | "defaultLateArrivalToleranceMinutes"
    | "defaultOperationStartTime"
    | "defaultOperationEndTime"
    | "geofenceReviewMarginMeters"
  >
>;

export interface CompanySettingsFormValues {
  operationTimezone: string;
  defaultRadiusMeters: string;
  geofenceReviewMarginMeters: string;
  defaultOperationStartTime: string;
  defaultOperationEndTime: string;
  defaultEarlyArrivalToleranceMinutes: string;
  defaultLateArrivalToleranceMinutes: string;
  lateGraceMinutes: string;
  earlyLeaveToleranceMinutes: string;
  requireCheckoutLocation: boolean;
  allowManualAttendanceCorrections: boolean;
}
