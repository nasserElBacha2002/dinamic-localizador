import { Alert, Box } from "@mui/material";

interface ErrorStateProps {
  message: string;
}

export function ErrorState({ message }: ErrorStateProps) {
  return (
    <Box sx={{ py: 2 }}>
      <Alert severity="error">{message}</Alert>
    </Box>
  );
}
