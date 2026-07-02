import { Button, Group } from "@mantine/core";
import type { ReactNode } from "react";

export interface FilterActionsProps {
  children?: ReactNode;
  onClear?: () => void;
  clearLabel?: string;
  disabled?: boolean;
}

export function FilterActions({
  children,
  onClear,
  clearLabel = "Limpiar",
  disabled = false,
}: FilterActionsProps) {
  if (!children && !onClear) {
    return null;
  }

  return (
    <Group gap="xs" align="flex-end" wrap="nowrap">
      {children}
      {onClear ? (
        <Button variant="subtle" size="compact-sm" onClick={onClear} disabled={disabled}>
          {clearLabel}
        </Button>
      ) : null}
    </Group>
  );
}
