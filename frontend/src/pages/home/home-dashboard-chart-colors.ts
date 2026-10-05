import type { HomeAttendanceDistributionItem } from "./home-dashboard-charts";

/** Mantine theme color keys for home dashboard visuals (no raw hex). */
export const HOME_ATTENDANCE_MANTINE_COLORS: Record<
  HomeAttendanceDistributionItem["key"],
  string
> = {
  present: "green",
  expected: "blue",
  absent: "red",
  justified: "grape",
};

export const HOME_INCIDENT_BAR_COLOR = "orange";
