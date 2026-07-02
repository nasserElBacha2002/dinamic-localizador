import type { ReactNode } from "react";

export interface FilterBarItemProps {
  children: ReactNode;
  span?: number;
  minWidth?: number | string;
}

export function FilterBarItem({ children, minWidth = 200 }: FilterBarItemProps) {
  return <div style={{ minWidth }}>{children}</div>;
}
