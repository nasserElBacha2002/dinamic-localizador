import { Input, Stack } from "@mantine/core";
import type { ReactNode } from "react";

export interface SettingsFormFieldProps {
  label: string;
  description: string;
  children: ReactNode;
}

export function SettingsFormField({ label, description, children }: SettingsFormFieldProps) {
  return (
    <Input.Wrapper
      label={label}
      description={description}
      withAsterisk={false}
      styles={{
        description: {
          minHeight: "2.5rem",
        },
      }}
    >
      <Stack gap={0}>{children}</Stack>
    </Input.Wrapper>
  );
}
