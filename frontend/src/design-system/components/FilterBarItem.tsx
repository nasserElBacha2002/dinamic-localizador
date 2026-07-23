import type { CSSProperties, ReactNode } from "react";
import classes from "./FilterBarItem.module.css";

export interface FilterBarItemProps {
  children: ReactNode;
  /**
   * Soft minimum width applied from `sm` and up only.
   * Mobile always keeps `min-width: 0` to avoid horizontal overflow.
   */
  desktopMinWidth?: number | string;
}

export function FilterBarItem({ children, desktopMinWidth }: FilterBarItemProps) {
  const style: CSSProperties | undefined =
    desktopMinWidth !== undefined
      ? {
          ["--filter-item-desktop-min" as string]:
            typeof desktopMinWidth === "number" ? `${desktopMinWidth}px` : desktopMinWidth,
        }
      : undefined;

  return (
    <div className={classes.item} style={style} data-has-desktop-min={desktopMinWidth !== undefined ? "true" : undefined}>
      {children}
    </div>
  );
}
