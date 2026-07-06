export interface AttendanceStatisticsSummary {
  totalAttendanceRecords: number;
  totalAssignedEmployees: number;
  attendancePercentage: number;
  presentCount: number;
  lateCount: number;
  outsideGeofenceCount: number;
  pendingReviewCount: number;
  rejectedCount: number;
  manuallyAcceptedCount: number;
  noShowCount: number;
  totalOperations: number;
}

export interface AttendanceTimelinePoint {
  date: string;
  present: number;
  late: number;
  outsideGeofence: number;
  pendingReview: number;
  rejected: number;
  noShow: number;
  total: number;
}

export interface AttendanceStatusDistributionItem {
  status: string;
  label: string;
  count: number;
}

export interface AttendanceByEmployeeRow {
  employeeId: string;
  employeeName: string;
  phoneNumber: string;
  assignedOperationsCount: number;
  confirmedAttendances: number;
  noShowCount: number;
  lateCount: number;
  outsideGeofenceCount: number;
  pendingReviewCount: number;
  attendancePercentage: number;
  lastAttendanceDate: string | null;
}

export interface AttendanceByOperationRow {
  operationId: string;
  serviceName: string;
  serviceAddress: string | null;
  scheduledStart: string;
  assignedEmployeesCount: number;
  presentCount: number;
  noShowCount: number;
  lateCount: number;
  outsideGeofenceCount: number;
  pendingReviewCount: number;
  attendancePercentage: number;
  operationalStatus: string;
}

export interface AttendanceByServiceRow {
  serviceId: string;
  serviceName: string;
  address: string | null;
  totalOperations: number;
  averageAttendancePercentage: number;
  totalAssignedEmployees: number;
  totalConfirmedAttendances: number;
  totalNoShows: number;
  totalLateRecords: number;
  totalOutsideGeofenceRecords: number;
  totalManualReviews: number;
}
