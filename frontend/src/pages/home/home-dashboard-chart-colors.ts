import type { HomeAttendanceDistributionItem } from "./home-dashboard-charts";

/** Mantine theme color keys for home dashboard visuals (no raw hex). */
export const HOME_ATTENDANCE_MANTINE_COLORS: Record<
  HomeAttendanceDistributionItem["key"],
  string
> = {
  present: "success",
  expected: "info",
  absent: "danger",
  justified: "gray",
};

/** Structural bar color — not accent orange (reserved for actions). */
export const HOME_INCIDENT_BAR_COLOR = "brand";
