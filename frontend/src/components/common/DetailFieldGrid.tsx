import { SimpleGrid, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

export interface DetailFieldItem {
  label: string;
  value: ReactNode;
}

interface DetailFieldGridProps {
  fields: DetailFieldItem[];
}

export function DetailFieldGrid({ fields }: DetailFieldGridProps) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
      {fields.map((field) => (
        <Stack key={field.label} gap={4}>
          <Text size="xs" c="dimmed" fw={500}>
            {field.label}
          </Text>
          <Text size="sm" component="div">
            {field.value}
          </Text>
        </Stack>
      ))}
    </SimpleGrid>
  );
}
