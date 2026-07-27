import { Button } from "@mantine/core";

export interface ClearFiltersButtonProps {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  /** Visual density — desktop bar uses subtle; drawer uses default. */
  variant?: "subtle" | "default";
  fullWidth?: boolean;
}

export function ClearFiltersButton({
  onClick,
  disabled = false,
  label = "Limpiar filtros",
  variant = "subtle",
  fullWidth = false,
}: ClearFiltersButtonProps) {
  return (
    <Button
      type="button"
      variant={variant}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      fullWidth={fullWidth}
    >
      {label}
    </Button>
  );
}
