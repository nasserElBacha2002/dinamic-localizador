import { TextInput } from "@mantine/core";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";

/**
 * Datetime-local input preserving string values (e.g. "2026-06-23T14:30").
 * Uses native HTML datetime-local via Mantine TextInput — @mantine/dates is deferred
 * until operation/attendance form migrations (PR 11+) to avoid timezone contract changes.
 */
export interface RHFDateTimeInputProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: string;
  disabled?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
}

export function RHFDateTimeInput<T extends FieldValues>({
  control,
  name,
  label,
  description,
  disabled = false,
  required = false,
  min,
  max,
}: RHFDateTimeInputProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextInput
          {...field}
          type="datetime-local"
          label={label}
          description={description}
          disabled={disabled}
          required={required}
          error={fieldState.error?.message}
          value={field.value ?? ""}
          min={min}
          max={max}
        />
      )}
    />
  );
}
