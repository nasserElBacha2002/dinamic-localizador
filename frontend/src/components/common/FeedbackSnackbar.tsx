import { Alert, Snackbar } from "@mui/material";

interface FeedbackSnackbarProps {
  open: boolean;
  message: string;
  severity?: "success" | "error" | "info";
  onClose: () => void;
}

export function FeedbackSnackbar({
  open,
  message,
  severity = "success",
  onClose,
}: FeedbackSnackbarProps) {
  return (
    <Snackbar open={open} autoHideDuration={5000} onClose={onClose} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
      <Alert onClose={onClose} severity={severity} variant="filled" sx={{ width: "100%" }}>
        {message}
      </Alert>
    </Snackbar>
  );
}
