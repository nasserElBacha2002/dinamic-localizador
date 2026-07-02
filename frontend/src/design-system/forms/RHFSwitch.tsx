import { Switch } from "@mantine/core";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";

export interface RHFSwitchProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function RHFSwitch<T extends FieldValues>({
  control,
  name,
  label,
  description,
  disabled = false,
}: RHFSwitchProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Switch
          label={label}
          description={description}
          error={fieldState.error?.message}
          checked={Boolean(field.value)}
          disabled={disabled}
          onChange={(event) => field.onChange(event.currentTarget.checked)}
          onBlur={field.onBlur}
          ref={field.ref}
        />
      )}
    />
  );
}
