import { Alert } from "@mantine/core";

export interface FormErrorAlertProps {
  message?: string | null;
  title?: string;
}

export function FormErrorAlert({ message, title = "Error" }: FormErrorAlertProps) {
  if (!message) {
    return null;
  }

  return (
    <Alert color="red" title={title}>
      {message}
    </Alert>
  );
}
