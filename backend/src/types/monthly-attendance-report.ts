export type MonthlyAttendanceIncidentType =
  | "LATE"
  | "EARLY_CHECKOUT"
  | "MISSING_CHECKIN"
  | "MISSING_CHECKOUT"
  | "UNAVAILABLE"
  | "CONFIRMED_BUT_ABSENT"
  | "UNANNOUNCED_ABSENCE"
  | "PENDING_REVIEW"
  | "REJECTED_ATTENDANCE"
  | "OUTSIDE_GEOFENCE";

export interface MonthlyAttendanceMetrics {
  scheduledWorkdays: number;
  presentWorkdays: number;
  absentWorkdays: number;
  justifiedWorkdays: number;
  attendanceRate: number;
  absenteeismRate: number;
  onTimeWorkdays: number;
  lateWorkdays: number;
  punctualityRate: number;
  earlyCheckoutWorkdays: number;
  missingCheckinWorkdays: number;
  missingCheckoutWorkdays: number;
  notifiedUnavailableWorkdays: number;
  confirmedButAbsentWorkdays: number;
  unannouncedAbsenceWorkdays: number;
  pendingReviewAttendances: number;
  rejectedAttendances: number;
  outsideGeofenceAttendances: number;
  workedMinutes: number;
  extraWorkedMinutes: number;
}

export interface MonthlyAttendanceEmployeeStats extends MonthlyAttendanceMetrics {
  employeeId: string;
  employeeName: string;
}

/** Company-wide names make the minute totals unambiguous to future presenters. */
export interface MonthlyAttendanceSummary extends MonthlyAttendanceMetrics {
  totalWorkedMinutes: number;
  totalExtraWorkedMinutes: number;
}

export interface MonthlyAttendanceServiceStats extends MonthlyAttendanceMetrics {
  serviceId: string;
  serviceName: string;
}

export interface MonthlyAttendanceIncident {
  type: MonthlyAttendanceIncidentType;
  employeeWorkdayId: string;
  employeeId: string;
  employeeName: string;
  operationWorkdayId: string;
  operationId: string;
  serviceId: string;
  serviceName: string;
  workDate: string;
  operationShiftId: string | null;
  shiftNameSnapshot: string | null;
  confirmationStatus: string | null;
  expectationStatus: string;
  effectiveState: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  expectedStartAt: string | null;
  expectedEndAt: string | null;
  validationStatus: string | null;
  locationStatus: string | null;
  punctualityStatus: string | null;
  checkoutStatus: string | null;
}

export interface MonthlyAttendanceReportDataset {
  schemaVersion: 1;
  companyId: string;
  period: {
    year: number;
    month: number;
    timezone: string;
    start: string;
    endExclusive: string;
  };
  evaluatedAt: string;
  summary: MonthlyAttendanceSummary;
  employees: MonthlyAttendanceEmployeeStats[];
  services: MonthlyAttendanceServiceStats[];
  incidents: MonthlyAttendanceIncident[];
}
