export const roundRate = (numerator: number, denominator: number): number => {
  if (denominator === 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 1000) / 10;
};

export const calculateAttendanceRate = (presentWorkdays: number, absentWorkdays: number): number =>
  roundRate(presentWorkdays, presentWorkdays + absentWorkdays);

export const calculateAbsenceRate = (presentWorkdays: number, absentWorkdays: number): number =>
  roundRate(absentWorkdays, presentWorkdays + absentWorkdays);

export const calculatePunctualityRate = (onTimeWorkdays: number, lateWorkdays: number): number =>
  roundRate(onTimeWorkdays, onTimeWorkdays + lateWorkdays);

export const calculateJustifiedRate = (justifiedWorkdays: number, scheduledWorkdays: number): number =>
  roundRate(justifiedWorkdays, scheduledWorkdays);

export interface WorkdayStateCounts {
  scheduledWorkdays: number;
  attendanceRequiredWorkdays: number;
  presentWorkdays: number;
  absentWorkdays: number;
  justifiedWorkdays: number;
  expectedOpenWorkdays: number;
  cancelledWorkdays: number;
}

export const deriveWorkdayStateCounts = (states: string[]): WorkdayStateCounts => {
  const counts: WorkdayStateCounts = {
    scheduledWorkdays: 0,
    attendanceRequiredWorkdays: 0,
    presentWorkdays: 0,
    absentWorkdays: 0,
    justifiedWorkdays: 0,
    expectedOpenWorkdays: 0,
    cancelledWorkdays: 0,
  };

  for (const state of states) {
    switch (state) {
      case "CANCELLED":
        counts.cancelledWorkdays += 1;
        break;
      case "JUSTIFIED":
        counts.scheduledWorkdays += 1;
        counts.justifiedWorkdays += 1;
        break;
      case "PRESENT":
        counts.scheduledWorkdays += 1;
        counts.attendanceRequiredWorkdays += 1;
        counts.presentWorkdays += 1;
        break;
      case "ABSENT":
        counts.scheduledWorkdays += 1;
        counts.attendanceRequiredWorkdays += 1;
        counts.absentWorkdays += 1;
        break;
      case "EXPECTED":
        counts.scheduledWorkdays += 1;
        counts.attendanceRequiredWorkdays += 1;
        counts.expectedOpenWorkdays += 1;
        break;
      default:
        break;
    }
  }

  return counts;
};
