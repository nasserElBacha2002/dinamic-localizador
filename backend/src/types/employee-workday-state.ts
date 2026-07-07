export type DerivedEmployeeWorkdayState =
  | "EXPECTED"
  | "JUSTIFIED"
  | "PRESENT"
  | "ABSENT"
  | "CANCELLED";

export interface EmployeeWorkdayAbsenceContext {
  absenceRequestId: string;
  absenceTypeName: string;
  absenceStartDate: string;
  absenceEndDate: string;
  hasAttendanceConflict: boolean;
}
