import { Box, Button, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      justifyContent="space-between"
      alignItems={{ xs: "stretch", sm: "center" }}
      spacing={2}
      sx={{ mb: 3 }}
    >
      <Box>
        <Typography variant="h4" component="h1" gutterBottom>
          {title}
        </Typography>
        {description ? (
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        ) : null}
      </Box>
      {action}
    </Stack>
  );
}

interface PageHeaderLinkActionProps {
  to: string;
  label: string;
}

export function PageHeaderLinkAction({ to, label }: PageHeaderLinkActionProps) {
  return (
    <Button component={RouterLink} to={to} variant="contained">
      {label}
    </Button>
  );
}
