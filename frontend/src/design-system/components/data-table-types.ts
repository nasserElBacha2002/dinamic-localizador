import type { ReactNode } from "react";

export type SortDirection = "asc" | "desc";
export type DataTableMobileView = "scroll" | "cards" | "summary";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  width?: number | string;
  align?: "left" | "center" | "right";
  sortable?: boolean;
  render?: (row: T) => ReactNode;
  getValue?: (row: T) => ReactNode;
}

export interface DataTableMobileField<T> {
  key: string;
  label: ReactNode;
  /** Preferred display callback. */
  render?: (row: T) => ReactNode;
  /** Alias of render for parity with table columns. */
  getValue?: (row: T) => ReactNode;
  /**
   * `always` — visible on cards and in summary panels.
   * `expanded` — only when summary accordion is open (or via expandedContent).
   */
  visibility?: "always" | "expanded";
}

export interface DataTableMobileCardConfig<T> {
  title: (row: T) => ReactNode;
  subtitle?: (row: T) => ReactNode;
  status?: (row: T) => ReactNode;
  fields?: Array<DataTableMobileField<T>>;
  actions?: (row: T) => ReactNode;
  /** Extra content when summary is expanded. */
  expandedContent?: (row: T) => ReactNode;
  /** Label for the explicit detail control. Default: "Ver detalle". */
  detailLabel?: ReactNode;
}

export interface DataTableBaseProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowKey: (row: T) => string | number;
  loading?: boolean;
  error?: ReactNode;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  onRowClick?: (row: T) => void;
  isRowClickable?: (row: T) => boolean;
  rowActions?: (row: T) => ReactNode;
  rowActionsHeader?: ReactNode;
  pagination?: ReactNode;
  sortBy?: string;
  sortDirection?: SortDirection;
  onSortChange?: (columnKey: string) => void;
  "aria-label"?: string;
  /** Min width for scroll-mode table only. */
  scrollMinWidth?: number | string;
}

export type DataTableProps<T> = DataTableBaseProps<T> &
  (
    | {
        mobileView?: "scroll";
        mobileCard?: never;
      }
    | {
        mobileView: "cards" | "summary";
        mobileCard: DataTableMobileCardConfig<T>;
      }
  );
