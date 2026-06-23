import { Box, Grid, Typography } from "@mui/material";
import type { ReactNode } from "react";

export interface DetailFieldItem {
  label: string;
  value: ReactNode;
}

interface DetailFieldGridProps {
  fields: DetailFieldItem[];
}

export function DetailFieldGrid({ fields }: DetailFieldGridProps) {
  return (
    <Grid container spacing={2} columns={{ xs: 2, sm: 4, md: 9, lg: 9 }}>
      {fields.map((field) => (
        <Grid key={field.label} size={1} sx={{ minWidth: 0 }}>
          <Box>
            <Typography variant="caption" color="text.secondary" display="block" noWrap>
              {field.label}
            </Typography>
            <Typography component="div" variant="body2" sx={{ mt: 0.25, wordBreak: "break-word" }}>
              {field.value}
            </Typography>
          </Box>
        </Grid>
      ))}
    </Grid>
  );
}
