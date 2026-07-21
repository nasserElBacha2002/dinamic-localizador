import { TextInput } from "@mantine/core";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";

export interface RHFTextInputProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  placeholder?: string;
  description?: string;
  disabled?: boolean;
  required?: boolean;
  type?: "text" | "email" | "password" | "tel";
  /** Defaults to Mantine order; use to keep sibling grid inputs aligned. */
  inputWrapperOrder?: Array<"label" | "input" | "description" | "error">;
}

export function RHFTextInput<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  description,
  disabled = false,
  required = false,
  type = "text",
  inputWrapperOrder,
}: RHFTextInputProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextInput
          {...field}
          label={label}
          placeholder={placeholder}
          description={description}
          disabled={disabled}
          required={required}
          type={type}
          error={fieldState.error?.message}
          value={field.value ?? ""}
          inputWrapperOrder={inputWrapperOrder}
        />
      )}
    />
  );
}
