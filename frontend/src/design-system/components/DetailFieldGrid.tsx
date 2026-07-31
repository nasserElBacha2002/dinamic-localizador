import { Grid, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { DISPLAY_FALLBACK } from "../../utils/display-safe";

export interface DetailFieldItem {
  label: string;
  value: ReactNode;
  /**
   * Column span on the 12-column grid.
   * Defaults: base 12 (1 col), sm 6 (2 cols), lg 4 (3 cols).
   */
  span?: number | { base?: number; sm?: number; md?: number; lg?: number; xl?: number };
}

export interface DetailFieldGridProps {
  fields: DetailFieldItem[];
}

const DEFAULT_SPAN = { base: 12, sm: 6, lg: 4 } as const;

function formatDetailValue(value: ReactNode): ReactNode {
  if (value === null || value === undefined) {
    return DISPLAY_FALLBACK;
  }
  if (typeof value === "string" && value.trim().length === 0) {
    return DISPLAY_FALLBACK;
  }
  return value;
}

export function DetailFieldGrid({ fields }: DetailFieldGridProps) {
  return (
    <Grid gap="md">
      {fields.map((field) => (
        <Grid.Col key={field.label} span={field.span ?? DEFAULT_SPAN}>
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Text size="xs" c="dimmed" fw={500} component="div">
              {field.label}
            </Text>
            <Text size="sm" component="div" style={{ overflowWrap: "anywhere" }}>
              {formatDetailValue(field.value)}
            </Text>
          </Stack>
        </Grid.Col>
      ))}
    </Grid>
  );
}
