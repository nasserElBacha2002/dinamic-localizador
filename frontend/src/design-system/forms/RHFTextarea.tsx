import { Textarea } from "@mantine/core";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";

export interface RHFTextareaProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  placeholder?: string;
  description?: string;
  disabled?: boolean;
  required?: boolean;
  minRows?: number;
  autosize?: boolean;
}

export function RHFTextarea<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  description,
  disabled = false,
  required = false,
  minRows = 3,
  autosize = false,
}: RHFTextareaProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Textarea
          {...field}
          label={label}
          placeholder={placeholder}
          description={description}
          disabled={disabled}
          required={required}
          minRows={minRows}
          autosize={autosize}
          error={fieldState.error?.message}
          value={field.value ?? ""}
        />
      )}
    />
  );
}
