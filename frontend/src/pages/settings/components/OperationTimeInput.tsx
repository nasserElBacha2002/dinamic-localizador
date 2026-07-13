import { TextInput } from "@mantine/core";
import { normalizeOperationTimeValue } from "../../../utils/operation-time";

export interface OperationTimeInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  "aria-label"?: string;
}

export function OperationTimeInput({
  value,
  onChange,
  disabled = false,
  "aria-label": ariaLabel,
}: OperationTimeInputProps) {
  return (
    <TextInput
      type="time"
      value={value}
      onChange={(event) => {
        onChange(normalizeOperationTimeValue(event.currentTarget.value));
      }}
      disabled={disabled}
      aria-label={ariaLabel}
    />
  );
}
