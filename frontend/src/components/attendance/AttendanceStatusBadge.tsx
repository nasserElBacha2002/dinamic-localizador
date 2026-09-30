import { StatusBadge, type StatusBadgeTone } from "../../design-system";
import type { BadgeProps } from "@mantine/core";

export interface AttendanceStatusBadgeProps {
  label: string;
  tone?: StatusBadgeTone;
  variant?: BadgeProps["variant"];
}

/**
 * Attendance status chip with full-label tooltip for truncated table/detail badges.
 * Keeps StatusBadge API unchanged for non-attendance screens.
 */
export function AttendanceStatusBadge({
  label,
  tone = "neutral",
  variant = "light",
}: AttendanceStatusBadgeProps) {
  return <StatusBadge label={label} tone={tone} variant={variant} tooltipLabel={label} />;
}
