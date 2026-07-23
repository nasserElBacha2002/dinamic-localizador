import { ActionIcon, Group, Loader, Menu } from "@mantine/core";
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
 * Uses Mantine Menu (Floating UI + portal) so the dropdown escapes ScrollArea.
 */
export function ActionMenu({
  primary,
  items = [],
  menuLabel = "Más acciones",
  stopPropagation = true,
}: ActionMenuProps) {
  const visibleItems = items.filter(Boolean);

  return (
    <Group
      gap="xs"
      wrap="nowrap"
      onClick={(event) => stopIfNeeded(event, stopPropagation)}
      onKeyDown={(event) => {
        if (stopPropagation) {
          event.stopPropagation();
        }
      }}
    >
      {primary}

      {visibleItems.length > 0 ? (
        <Menu
          shadow="md"
          width={220}
          position="bottom-end"
          withinPortal
          middlewares={{ flip: true, shift: true, inline: false }}
          closeOnItemClick
        >
          <Menu.Target>
            <ActionIcon
              variant="default"
              size="lg"
              aria-label={menuLabel}
              onClick={(event) => stopIfNeeded(event, stopPropagation)}
            >
              ⋮
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {visibleItems.map((item) => {
              const isBusy = Boolean(item.loading);
              const isDisabled = Boolean(item.disabled) || isBusy;
              return (
                <Menu.Item
                  key={item.key}
                  color={item.destructive ? "danger" : undefined}
                  disabled={isDisabled}
                  leftSection={
                    isBusy ? <Loader size="xs" aria-hidden /> : item.leftSection
                  }
                  aria-busy={isBusy || undefined}
                  onClick={(event) => {
                    stopIfNeeded(event, stopPropagation);
                    if (isDisabled) {
                      return;
                    }
                    item.onClick?.();
                  }}
                >
                  {item.label}
                </Menu.Item>
              );
            })}
          </Menu.Dropdown>
        </Menu>
      ) : null}
    </Group>
  );
}
