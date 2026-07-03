import { TextInput } from "@mantine/core";

export interface OperationTimeInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  "aria-label"?: string;
}

export function normalizeOperationTimeValue(raw: string): string {
  if (!raw.trim()) {
    return "";
  }

  const match = raw.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return raw.trim();
  }

  const hours = match[1].padStart(2, "0");
  const minutes = match[2];
  return `${hours}:${minutes}`;
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
