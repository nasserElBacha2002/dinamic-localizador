import { TableCell, TableRow, type TableRowProps } from "@mui/material";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";

interface ClickableTableRowProps extends Omit<TableRowProps, "onClick" | "onKeyDown"> {
  to: string;
  children: ReactNode;
  ariaLabel?: string;
}

export function ClickableTableRow({
  to,
  children,
  ariaLabel,
  hover = true,
  sx,
  ...tableRowProps
}: ClickableTableRowProps) {
  const navigate = useNavigate();

  const handleNavigate = () => {
    navigate(to);
  };

  const handleClick = (event: MouseEvent<HTMLTableRowElement>) => {
    if (event.defaultPrevented) {
      return;
    }

    handleNavigate();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleNavigate();
    }
  };

  return (
    <TableRow
      hover={hover}
      role="link"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      sx={{ cursor: "pointer", ...sx }}
      {...tableRowProps}
    >
      {children}
    </TableRow>
  );
}

export function TableRowActions({ children }: { children: ReactNode }) {
  return (
    <TableCell
      align="right"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {children}
    </TableCell>
  );
}
