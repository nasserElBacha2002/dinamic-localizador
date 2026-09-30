import { Badge, Tooltip, type BadgeProps } from "@mantine/core";
import type { ReactNode } from "react";

export type StatusBadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

export interface StatusBadgeProps {
  label: ReactNode;
  tone?: StatusBadgeTone;
  variant?: BadgeProps["variant"];
  /**
   * When set, wraps the badge in a Mantine Tooltip showing the full label.
   * Useful for truncated chips in compact table columns.
   */
  tooltipLabel?: string;
}

const toneColorMap: Record<StatusBadgeTone, string> = {
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "brand",
  neutral: "gray",
};

export function StatusBadge({
  label,
  tone = "neutral",
  variant = "light",
  tooltipLabel,
}: StatusBadgeProps) {
  const badge = (
    <Badge
      color={toneColorMap[tone]}
      variant={variant}
      style={{
        textTransform: "none",
        whiteSpace: "nowrap",
        ...(tooltipLabel
          ? {
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }
          : null),
      }}
    >
      {label}
    </Badge>
  );

  if (!tooltipLabel) {
    return badge;
  }

  return (
    <Tooltip
      label={tooltipLabel}
      withArrow
      openDelay={200}
      events={{ hover: true, focus: true, touch: true }}
    >
      <span
        tabIndex={0}
        style={{
          display: "inline-flex",
          maxWidth: "100%",
          outline: "none",
          verticalAlign: "middle",
        }}
      >
        {badge}
      </span>
    </Tooltip>
  );
}
