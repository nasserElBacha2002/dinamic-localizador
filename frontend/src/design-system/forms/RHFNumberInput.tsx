import { NumberInput } from "@mantine/core";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";

export interface RHFNumberInputProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  placeholder?: string;
  description?: string;
  disabled?: boolean;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
}

export function RHFNumberInput<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  description,
  disabled = false,
  required = false,
  min,
  max,
  step,
}: RHFNumberInputProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <NumberInput
          label={label}
          placeholder={placeholder}
          description={description}
          disabled={disabled}
          required={required}
          min={min}
          max={max}
          step={step}
          error={fieldState.error?.message}
          value={typeof field.value === "number" ? field.value : undefined}
          onChange={(value) => {
            field.onChange(typeof value === "number" ? value : undefined);
          }}
          onBlur={field.onBlur}
          ref={field.ref}
        />
      )}
    />
  );
}
