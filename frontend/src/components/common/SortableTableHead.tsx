import { TableCell, TableHead, TableRow, TableSortLabel } from "@mui/material";

export interface SortableColumn<T extends string> {
  id: T;
  label: string;
  align?: "left" | "right" | "center";
}

interface SortableTableHeadProps<T extends string> {
  columns: SortableColumn<T>[];
  sortBy: T;
  sortDirection: "asc" | "desc";
  onSortChange: (field: T) => void;
}

export function SortableTableHead<T extends string>({
  columns,
  sortBy,
  sortDirection,
  onSortChange,
}: SortableTableHeadProps<T>) {
  return (
    <TableHead>
      <TableRow>
        {columns.map((column) => (
          <TableCell
            key={column.id}
            align={column.align}
            sortDirection={sortBy === column.id ? sortDirection : false}
          >
            <TableSortLabel
              active={sortBy === column.id}
              direction={sortBy === column.id ? sortDirection : "asc"}
              onClick={() => onSortChange(column.id)}
            >
              {column.label}
            </TableSortLabel>
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );
}
