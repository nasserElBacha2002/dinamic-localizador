import { calculateAttendanceRate } from "../attendance-statistics-metrics";
import type { AttendanceAlertBand } from "../../constants/attendance-alert";

/**
 * Precise attendance rate (0–100) for threshold crossing comparisons.
 * Display/UI should use calculateAttendanceRate (1 decimal) from statistics.
 */
export const calculatePreciseAttendanceRate = (
  presentWorkdays: number,
  absentWorkdays: number,
): number => {
  const denominator = presentWorkdays + absentWorkdays;
  if (denominator <= 0) {
    return 0;
  }
  return (presentWorkdays / denominator) * 100;
};

export const resolveAttendanceAlertBand = (input: {
  presentWorkdays: number;
  absentWorkdays: number;
  minimumWorkdays: number;
  thresholdPercent: number;
}): AttendanceAlertBand => {
  const evaluated = input.presentWorkdays + input.absentWorkdays;
  if (evaluated < input.minimumWorkdays) {
    return "INSUFFICIENT_SAMPLE";
  }
  const rate = calculatePreciseAttendanceRate(input.presentWorkdays, input.absentWorkdays);
  return rate < input.thresholdPercent ? "BELOW" : "ABOVE_OR_EQUAL";
};

export const formatAttendanceRateForDisplay = (
  presentWorkdays: number,
  absentWorkdays: number,
): number => calculateAttendanceRate(presentWorkdays, absentWorkdays);

export const isCooldownElapsed = (
  lastAlertedAt: Date | string | null | undefined,
  cooldownDays: number,
  now: Date = new Date(),
): boolean => {
  if (!lastAlertedAt) {
    return true;
  }
  const last = lastAlertedAt instanceof Date ? lastAlertedAt : new Date(lastAlertedAt);
  const elapsedMs = now.getTime() - last.getTime();
  return elapsedMs >= cooldownDays * 24 * 60 * 60 * 1000;
};

export type AttendanceThresholdTransition =
  | "BASELINE"
  | "REBASELINE_CONFIG"
  | "REBASELINE_FIRST_SAMPLE"
  | "CROSSING_BELOW"
  | "CROSSING_BELOW_COOLDOWN"
  | "RECOVERED_ABOVE"
  | "STAY_BELOW"
  | "STAY_ABOVE"
  | "STAY_INSUFFICIENT"
  | "TO_INSUFFICIENT";

export const classifyAttendanceThresholdTransition = (input: {
  priorBand: AttendanceAlertBand | null;
  nextBand: AttendanceAlertBand;
  configVersionMatch: boolean;
}): AttendanceThresholdTransition => {
  if (!input.configVersionMatch) {
    return "REBASELINE_CONFIG";
  }
  if (input.priorBand === null) {
    return "BASELINE";
  }
  if (input.priorBand === "INSUFFICIENT_SAMPLE" && input.nextBand !== "INSUFFICIENT_SAMPLE") {
    return "REBASELINE_FIRST_SAMPLE";
  }
  if (input.priorBand === "ABOVE_OR_EQUAL" && input.nextBand === "BELOW") {
    return "CROSSING_BELOW";
  }
  if (input.priorBand === "BELOW" && input.nextBand === "ABOVE_OR_EQUAL") {
    return "RECOVERED_ABOVE";
  }
  if (input.nextBand === "INSUFFICIENT_SAMPLE") {
    return input.priorBand === "INSUFFICIENT_SAMPLE" ? "STAY_INSUFFICIENT" : "TO_INSUFFICIENT";
  }
  if (input.nextBand === "BELOW") {
    return "STAY_BELOW";
  }
  return "STAY_ABOVE";
};
