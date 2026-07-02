import { Badge, type BadgeProps } from "@mantine/core";
import type { ReactNode } from "react";

export type StatusBadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

export interface StatusBadgeProps {
  label: ReactNode;
  tone?: StatusBadgeTone;
  variant?: BadgeProps["variant"];
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
}: StatusBadgeProps) {
  return (
    <Badge color={toneColorMap[tone]} variant={variant}>
      {label}
    </Badge>
  );
}
