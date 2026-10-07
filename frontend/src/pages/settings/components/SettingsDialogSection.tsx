import { Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "../settings-visual.module.css";

export interface SettingsDialogSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function SettingsDialogSection({
  title,
  description,
  children,
}: SettingsDialogSectionProps) {
  return (
    <Stack gap="sm" className={classes.dialogSection}>
      <Title order={5} className={classes.sectionTitle}>
        {title}
      </Title>
      {description ? (
        <Text size="xs" className={classes.sectionDescription}>
          {description}
        </Text>
      ) : null}
      {children}
    </Stack>
  );
}
