import { Grid, type SxProps, type Theme } from "@mui/material";
import type { PropsWithChildren, ReactNode } from "react";

interface ListFiltersProps extends PropsWithChildren {
  sx?: SxProps<Theme>;
}

export function ListFilters({ children, sx }: ListFiltersProps) {
  return (
    <Grid container spacing={2} sx={{ mb: 3, ...sx }}>
      {children}
    </Grid>
  );
}

interface FilterItemProps {
  children: ReactNode;
  size?: { xs?: number; sm?: number; md?: number; lg?: number; xl?: number };
}

export function FilterItem({
  children,
  size = { xs: 12, sm: 6, md: 4, lg: 3 },
}: FilterItemProps) {
  return <Grid size={size}>{children}</Grid>;
}
