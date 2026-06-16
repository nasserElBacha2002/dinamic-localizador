import { Box, CircularProgress, Typography } from "@mui/material";

export function LoadingState({ message = "Cargando..." }: { message?: string }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 8, gap: 2 }}>
      <CircularProgress aria-label={message} />
      <Typography color="text.secondary">{message}</Typography>
    </Box>
  );
}
