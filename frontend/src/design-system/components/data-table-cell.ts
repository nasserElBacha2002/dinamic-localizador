import type { ReactNode } from "react";
import { DISPLAY_FALLBACK } from "../../utils/display-safe";

export interface DataTableColumnLike<T> {
  key: string;
  render?: (row: T) => ReactNode;
  getValue?: (row: T) => ReactNode;
}

export function formatDataTableCellDisplay(value: ReactNode): ReactNode {
  if (value === null || value === undefined) {
    return DISPLAY_FALLBACK;
  }

  if (typeof value === "string" && value.trim().length === 0) {
    return DISPLAY_FALLBACK;
  }

  return value;
}

export function resolveDataTableCellValue<T>(row: T, column: DataTableColumnLike<T>): ReactNode {
  try {
    if (column.render) {
      return formatDataTableCellDisplay(column.render(row));
    }

    if (column.getValue) {
      return formatDataTableCellDisplay(column.getValue(row));
    }

    return DISPLAY_FALLBACK;
  } catch (error) {
    if (import.meta.env?.DEV) {
      console.warn("[DataTable] Failed to resolve cell value", {
        columnKey: column.key,
        row,
        error,
      });
    }

    return DISPLAY_FALLBACK;
  }
}
