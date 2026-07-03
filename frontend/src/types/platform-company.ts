export interface PlatformCompany {
  id: string;
  name: string;
  defaultTimezone: string;
  status: string;
  createdAt: string;
  updatedAt: string;
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
    "attendance" | "inventory_operations" | "absences" | "reports" | "bot_simulator"
  >;
  owner: {
    name: string;
    email: string;
    temporaryPassword: string;
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
    owner: {
      userId: string;
      name: string;
      email: string;
      companyRole: string;
      membershipStatus: string;
    };
    message: string;
  };
}
