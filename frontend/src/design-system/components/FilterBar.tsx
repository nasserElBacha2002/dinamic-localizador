import { Badge, Button, Drawer, Group, Paper, SimpleGrid, Stack } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import type { ReactNode } from "react";
import { useIsBelow } from "../hooks/useIsBelow";
import { ClearFiltersButton } from "./ClearFiltersButton";
import { FilterBarItem, type FilterBarItemProps } from "./FilterBarItem";

export type { FilterBarItemProps };

export interface FilterBarProps {
  children: ReactNode;
  actions?: ReactNode;
  /**
   * Primary search control — stays visible on mobile.
   * Secondary filters (`children`) open in a Drawer below `sm`.
   */
  search?: ReactNode;
  /** Count of filters that differ from defaults (badge + enable clear). */
  activeFilterCount?: number;
  /**
   * When provided, renders "Limpiar filtros" on desktop and mobile.
   * Disabled when `activeFilterCount` is 0.
   */
  onClearFilters?: () => void;
  filtersTitle?: string;
  clearLabel?: string;
  /**
   * Label for the drawer dismiss control.
   * Filters apply immediately; this only closes the drawer (default: "Listo").
   */
  applyLabel?: string;
}

export function FilterBar({
  children,
  actions,
  search,
  activeFilterCount = 0,
  onClearFilters,
  filtersTitle = "Filtros",
  clearLabel = "Limpiar filtros",
  applyLabel = "Listo",
}: FilterBarProps) {
  const isMobile = useIsBelow("sm");
  const [opened, { open, close }] = useDisclosure(false);
  const hasActiveFilters = activeFilterCount > 0;

  const clearAndActions = onClearFilters || actions ? (
    <Group
      gap="sm"
      wrap="wrap"
      justify="flex-end"
      align="flex-end"
      style={{ minWidth: 0, width: "100%", height: "100%" }}
    >
      {onClearFilters ? (
        <ClearFiltersButton
          onClick={onClearFilters}
          disabled={!hasActiveFilters}
          label={clearLabel}
          variant="subtle"
        />
      ) : null}
      {actions}
    </Group>
  ) : null;

  if (!isMobile) {
    return (
      <Paper withBorder radius="md" p="md" mb="md">
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md" verticalSpacing="md">
          {search ? <div style={{ minWidth: 0, width: "100%" }}>{search}</div> : null}
          {children}
          {clearAndActions}
        </SimpleGrid>
      </Paper>
    );
  }

  return (
    <>
      <Paper withBorder radius="md" p="md" mb="md">
        <Stack gap="sm">
          {search ? <div style={{ minWidth: 0 }}>{search}</div> : null}
          <Group gap="sm" wrap="wrap">
            <Button variant="default" onClick={open} aria-haspopup="dialog">
              {filtersTitle}
              {activeFilterCount > 0 ? (
                <Badge ml={8} size="sm" variant="filled" circle>
                  {activeFilterCount}
                </Badge>
              ) : null}
            </Button>
            {onClearFilters ? (
              <ClearFiltersButton
                onClick={onClearFilters}
                disabled={!hasActiveFilters}
                label={clearLabel}
                variant="subtle"
              />
            ) : null}
            {actions}
          </Group>
        </Stack>
      </Paper>

      <Drawer
        opened={opened}
        onClose={close}
        title={filtersTitle}
        position="bottom"
        size="auto"
        padding="md"
        styles={{
          content: { maxHeight: "85dvh" },
          body: { paddingBottom: 24 },
        }}
      >
        <Stack gap="md">
          <SimpleGrid cols={1} spacing="md">
            {children}
          </SimpleGrid>
          <Group justify="space-between" gap="sm" wrap="wrap">
            {onClearFilters ? (
              <ClearFiltersButton
                onClick={onClearFilters}
                disabled={!hasActiveFilters}
                label={clearLabel}
                variant="default"
              />
            ) : (
              <span />
            )}
            <Button onClick={close}>{applyLabel}</Button>
          </Group>
        </Stack>
      </Drawer>
    </>
  );
}

FilterBar.Item = FilterBarItem;
