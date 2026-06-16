import { AppBar, Box, Container, Toolbar, Typography } from "@mui/material";
import type { PropsWithChildren } from "react";

export function MainLayout({ children }: PropsWithChildren) {
  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <Typography variant="h6" component="h1">
            Dinamic Attendance
          </Typography>
        </Toolbar>
      </AppBar>

      <Container sx={{ py: 4 }}>{children}</Container>
    </Box>
  );
}
