import { Accordion, Box, Group, Paper, Stack, Text, UnstyledButton } from "@mantine/core";
import type { ReactNode } from "react";
import { DISPLAY_FALLBACK } from "../../utils/display-safe";
import type { DataTableMobileCardConfig, DataTableMobileField } from "./data-table-types";

function resolveMobileFieldValue<T>(row: T, field: DataTableMobileField<T>): ReactNode {
  try {
    if (field.render) {
      return field.render(row) ?? DISPLAY_FALLBACK;
    }
    if (field.getValue) {
      return field.getValue(row) ?? DISPLAY_FALLBACK;
    }
  } catch {
    return DISPLAY_FALLBACK;
  }
  return DISPLAY_FALLBACK;
}

export function DataTableCards<T>({
  rows,
  getRowKey,
  onRowClick,
  isRowClickable,
  rowActions,
  mobileCard,
  summary,
  "aria-label": ariaLabel,
}: {
  rows: T[];
  getRowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  isRowClickable?: (row: T) => boolean;
  rowActions?: (row: T) => ReactNode;
  mobileCard: DataTableMobileCardConfig<T>;
  summary: boolean;
  "aria-label"?: string;
}) {
  const alwaysFields =
    mobileCard.fields?.filter((field) => (field.visibility ?? "always") === "always") ?? [];
  const expandedFields =
    mobileCard.fields?.filter((field) => field.visibility === "expanded") ?? [];
  const detailLabel = mobileCard.detailLabel ?? "Ver detalle";

  if (summary) {
    return (
      <Accordion variant="separated" radius="md" aria-label={ariaLabel}>
        {rows.map((row) => {
          const rowKey = String(getRowKey(row));
          const clickable = Boolean(onRowClick) && (isRowClickable ? isRowClickable(row) : true);
          const actions = mobileCard.actions?.(row) ?? rowActions?.(row);

          return (
            <Accordion.Item key={rowKey} value={rowKey}>
              <Accordion.Control>
                <Group justify="space-between" wrap="nowrap" gap="sm" pr="xs">
                  <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                    <Text fw={600} size="sm" lineClamp={2}>
                      {mobileCard.title(row)}
                    </Text>
                    {mobileCard.subtitle ? (
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {mobileCard.subtitle(row)}
                      </Text>
                    ) : null}
                  </Stack>
                  {mobileCard.status?.(row)}
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  {[...alwaysFields, ...expandedFields].map((field) => (
                    <Box key={field.key}>
                      <Text size="xs" c="dimmed">
                        {field.label}
                      </Text>
                      <Text size="sm">{resolveMobileFieldValue(row, field)}</Text>
                    </Box>
                  ))}
                  {mobileCard.expandedContent?.(row)}
                  <Group justify="space-between" gap="sm" wrap="wrap">
                    {clickable ? (
                      <UnstyledButton
                        type="button"
                        onClick={() => onRowClick?.(row)}
                        style={{ fontSize: "var(--mantine-font-size-sm)", fontWeight: 600 }}
                      >
                        {detailLabel}
                      </UnstyledButton>
                    ) : (
                      <span />
                    )}
                    {actions ? (
                      <Box
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {actions}
                      </Box>
                    ) : null}
                  </Group>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion>
    );
  }

  return (
    <Stack gap="sm" aria-label={ariaLabel} role="list">
      {rows.map((row) => {
        const rowKey = getRowKey(row);
        const clickable = Boolean(onRowClick) && (isRowClickable ? isRowClickable(row) : true);
        const actions = mobileCard.actions?.(row) ?? rowActions?.(row);
        const titleNode = mobileCard.title(row);

        return (
          <Paper key={rowKey} withBorder radius="md" p="md" role="listitem">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
                <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                  <Text fw={600} size="sm" lineClamp={2}>
                    {titleNode}
                  </Text>
                  {mobileCard.subtitle ? (
                    <Text size="xs" c="dimmed" lineClamp={2}>
                      {mobileCard.subtitle(row)}
                    </Text>
                  ) : null}
                </Stack>
                {mobileCard.status?.(row)}
              </Group>

              {alwaysFields.length > 0 ? (
                <Stack gap={6}>
                  {alwaysFields.map((field) => (
                    <Group key={field.key} justify="space-between" gap="sm" wrap="nowrap">
                      <Text size="xs" c="dimmed">
                        {field.label}
                      </Text>
                      <Text size="sm" ta="right" style={{ minWidth: 0 }}>
                        {resolveMobileFieldValue(row, field)}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              ) : null}

              <Group justify="space-between" gap="sm" wrap="wrap">
                {clickable ? (
                  <UnstyledButton
                    type="button"
                    onClick={() => onRowClick?.(row)}
                    style={{ fontSize: "var(--mantine-font-size-sm)", fontWeight: 600 }}
                  >
                    {detailLabel}
                  </UnstyledButton>
                ) : (
                  <span />
                )}
                {actions ? (
                  <Box
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    {actions}
                  </Box>
                ) : null}
              </Group>
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
}
