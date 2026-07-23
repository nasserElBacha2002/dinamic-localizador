import type { ReactNode } from "react";

export interface FilterBarItemProps {
  children: ReactNode;
  span?: number;
  /**
   * Soft minimum width for desktop filter cells.
   * Ignored on narrow layouts when parent stacks to one column (no rigid overflow).
   */
  minWidth?: number | string;
}

export function FilterBarItem({ children, minWidth }: FilterBarItemProps) {
  return (
    <div
      style={{
        minWidth: 0,
        width: "100%",
        ...(minWidth !== undefined ? { ["--filter-item-min" as string]: minWidth } : null),
      }}
    >
      {children}
    </div>
  );
}
