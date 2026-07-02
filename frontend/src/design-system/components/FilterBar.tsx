import { Group, Paper, SimpleGrid } from "@mantine/core";
import type { ReactNode } from "react";
import { FilterBarItem, type FilterBarItemProps } from "./FilterBarItem";

export type { FilterBarItemProps };

export interface FilterBarProps {
  children: ReactNode;
  actions?: ReactNode;
}

export function FilterBar({ children, actions }: FilterBarProps) {
  return (
    <Paper withBorder radius="md" p="md" mb="md">
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md" style={{ flex: 1 }}>
          {children}
        </SimpleGrid>
        {actions ? <Group gap="sm">{actions}</Group> : null}
      </Group>
    </Paper>
  );
}

FilterBar.Item = FilterBarItem;

export interface FilterBar {
  Item: typeof FilterBarItem;
}
