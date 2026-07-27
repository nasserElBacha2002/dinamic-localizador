import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";

export interface ClearFiltersButtonProps {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  /** Visual density — desktop bar uses subtle; drawer uses default. */
  variant?: "subtle" | "default";
  fullWidth?: boolean;
}

const subtleStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  border: "none",
  borderRadius: "var(--mantine-radius-sm, 4px)",
  color: "var(--mantine-color-anchor, #228be6)",
  font: "inherit",
  fontSize: "var(--mantine-font-size-sm, 0.875rem)",
  padding: "0.35rem 0.65rem",
  textDecoration: "none",
  userSelect: "none",
};

const defaultStyle: CSSProperties = {
  ...subtleStyle,
  background: "var(--mantine-color-default, #fff)",
  border: "1px solid var(--mantine-color-default-border, #ced4da)",
  color: "var(--mantine-color-text, #212529)",
};

/**
 * Clear-filters control for FilterBar.
 *
 * Rendered as a styled anchor (not `role="button"` / native `<button>`) because
 * those roles currently trigger unbounded memory growth under happy-dom when
 * permanently mounted in the desktop FilterBar layout.
 */
export function ClearFiltersButton({
  onClick,
  disabled = false,
  label = "Limpiar filtros",
  variant = "subtle",
  fullWidth = false,
}: ClearFiltersButtonProps) {
  const activate = (event: MouseEvent<HTMLAnchorElement> | KeyboardEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (disabled) {
      return;
    }
    onClick();
  };

  return (
    <a
      href="#limpiar-filtros"
      aria-label={label}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          activate(event);
        }
      }}
      style={{
        ...(variant === "default" ? defaultStyle : subtleStyle),
        width: fullWidth ? "100%" : undefined,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        pointerEvents: disabled ? "none" : undefined,
      }}
    >
      {label}
    </a>
  );
}
