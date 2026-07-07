import type { DerivedEmployeeWorkdayState } from "../types/employee-workday-state";
import type { EmployeeWorkday } from "../types/workday";

export const isAttendanceOpportunityOpen = (input: {
  expectedStartAt: string;
  expectedEndAt: string | null;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  referenceAt?: Date;
}): boolean => {
  const now = input.referenceAt ?? new Date();
  const start = new Date(input.expectedStartAt);
  const end = input.expectedEndAt
    ? new Date(input.expectedEndAt)
    : new Date(start.getTime() + input.lateToleranceMinutes * 60_000);

  const opportunityEnd = new Date(end.getTime() + input.lateToleranceMinutes * 60_000);
  return now <= opportunityEnd;
};

export const deriveEmployeeWorkdayState = (input: {
  employeeWorkday: Pick<EmployeeWorkday, "expectationStatus">;
  hasAttendance: boolean;
  expectedStartAt: string;
  expectedEndAt: string | null;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  referenceAt?: Date;
}): DerivedEmployeeWorkdayState => {
  if (input.employeeWorkday.expectationStatus === "CANCELLED") {
    return "CANCELLED";
  }

  if (input.employeeWorkday.expectationStatus === "JUSTIFIED") {
    return "JUSTIFIED";
  }

  if (input.hasAttendance) {
    return "PRESENT";
  }

  if (
    isAttendanceOpportunityOpen({
      expectedStartAt: input.expectedStartAt,
      expectedEndAt: input.expectedEndAt,
      earlyToleranceMinutes: input.earlyToleranceMinutes,
      lateToleranceMinutes: input.lateToleranceMinutes,
      referenceAt: input.referenceAt,
    })
  ) {
    return "EXPECTED";
  }

  return "ABSENT";
};
