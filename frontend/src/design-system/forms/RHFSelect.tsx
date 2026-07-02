import { Select } from "@mantine/core";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface RHFSelectProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  data: SelectOption[];
  placeholder?: string;
  description?: string;
  disabled?: boolean;
  required?: boolean;
  clearable?: boolean;
}

export function RHFSelect<T extends FieldValues>({
  control,
  name,
  label,
  data,
  placeholder,
  description,
  disabled = false,
  required = false,
  clearable = false,
}: RHFSelectProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Select
          label={label}
          placeholder={placeholder}
          description={description}
          disabled={disabled}
          required={required}
          clearable={clearable}
          data={data}
          error={fieldState.error?.message}
          value={field.value ? String(field.value) : null}
          onChange={(value) => field.onChange(value ?? "")}
          onBlur={field.onBlur}
          ref={field.ref}
        />
      )}
    />
  );
}
