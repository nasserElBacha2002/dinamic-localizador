import { TextInput } from "@mantine/core";
import type { ReactNode } from "react";
import { normalizeOperationTimeValue } from "../../../utils/operation-time";

export interface OperationTimeInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: ReactNode;
  id?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

export function OperationTimeInput({
  value,
  onChange,
  disabled = false,
  error,
  id,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: OperationTimeInputProps) {
  return (
    <TextInput
      id={id}
      type="time"
      value={value}
      onChange={(event) => {
        onChange(normalizeOperationTimeValue(event.currentTarget.value));
      }}
      disabled={disabled}
      error={error}
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
    />
  );
}
