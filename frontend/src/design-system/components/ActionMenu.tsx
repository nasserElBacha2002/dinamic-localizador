import { ActionIcon, Group, Paper, Stack, UnstyledButton } from "@mantine/core";
import { useDisclosure, useClickOutside } from "@mantine/hooks";
import type { MouseEvent, ReactNode } from "react";

export type ActionMenuItem = {
  key: string;
  label: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  destructive?: boolean;
  leftSection?: ReactNode;
};

export interface ActionMenuProps {
  /** Already-resolved primary control (Button, Link, etc.). */
  primary?: ReactNode;
  items?: ActionMenuItem[];
  menuLabel?: string;
  /** Stop click from bubbling (e.g. DataTable row click). Default true. */
  stopPropagation?: boolean;
}

function stopIfNeeded(event: MouseEvent, enabled: boolean): void {
  if (enabled) {
    event.stopPropagation();
  }
}

/**
 * Primary action slot + overflow menu for secondary/destructive actions.
 * Presentation only — permissions and confirmations stay in the consumer.
 *
 * Uses an inline disclosure panel (not Floating UI) so menus remain
 * reliable in constrained DOM environments and keyboard-accessible.
 */
export function ActionMenu({
  primary,
  items = [],
  menuLabel = "Más acciones",
  stopPropagation = true,
}: ActionMenuProps) {
  const visibleItems = items.filter(Boolean);
  const [opened, { toggle, close }] = useDisclosure(false);
  const panelRef = useClickOutside(() => close());

  return (
    <Group
      gap="xs"
      wrap="nowrap"
      style={{ position: "relative" }}
      onClick={(event) => stopIfNeeded(event, stopPropagation)}
      onKeyDown={(event) => {
        if (stopPropagation) {
          event.stopPropagation();
        }
      }}
    >
      {primary}

      {visibleItems.length > 0 ? (
        <>
          <ActionIcon
            variant="default"
            size="lg"
            aria-label={menuLabel}
            aria-haspopup="menu"
            aria-expanded={opened}
            onClick={(event) => {
              stopIfNeeded(event, stopPropagation);
              toggle();
            }}
          >
            ⋮
          </ActionIcon>

          {opened ? (
            <Paper
              ref={panelRef}
              withBorder
              shadow="md"
              p={4}
              role="menu"
              aria-label={menuLabel}
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                zIndex: 400,
                minWidth: 200,
              }}
            >
              <Stack gap={2}>
                {visibleItems.map((item) => (
                  <UnstyledButton
                    key={item.key}
                    role="menuitem"
                    disabled={item.disabled || item.loading}
                    onClick={(event) => {
                      stopIfNeeded(event, stopPropagation);
                      if (item.disabled || item.loading) {
                        return;
                      }
                      item.onClick?.();
                      close();
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: 6,
                      color: item.destructive
                        ? "var(--mantine-color-danger-6)"
                        : undefined,
                      opacity: item.disabled || item.loading ? 0.5 : 1,
                      cursor: item.disabled || item.loading ? "not-allowed" : "pointer",
                    }}
                  >
                    {item.leftSection}
                    {item.label}
                  </UnstyledButton>
                ))}
              </Stack>
            </Paper>
          ) : null}
        </>
      ) : null}
    </Group>
  );
}
