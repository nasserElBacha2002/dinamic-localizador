import { SimpleGrid, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

export interface OperationDetailFieldItem {
  label: string;
  value: ReactNode;
}

interface OperationDetailFieldGridProps {
  fields: OperationDetailFieldItem[];
}

export function OperationDetailFieldGrid({ fields }: OperationDetailFieldGridProps) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 1, xl: 2 }} spacing="md">
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
