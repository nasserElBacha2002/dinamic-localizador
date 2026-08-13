import { ActionIcon, Button, Group, Loader, Menu } from "@mantine/core";
import type { MouseEvent, ReactNode } from "react";
import { useIsBelow } from "../hooks/useIsBelow";

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
  /**
   * `responsive` (default): secondary actions as buttons on desktop, overflow
   * menu below `sm`. `menu`: always overflow (table/row density).
   */
  mode?: "responsive" | "menu";
  /** Stop click from bubbling (e.g. DataTable row click). Default true. */
  stopPropagation?: boolean;
}

function stopIfNeeded(event: MouseEvent, enabled: boolean): void {
  if (enabled) {
    event.stopPropagation();
  }
}

function SecondaryOverflowMenu({
  items,
  menuLabel,
  stopPropagation,
}: {
  items: ActionMenuItem[];
  menuLabel: string;
  stopPropagation: boolean;
}) {
  return (
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
        {items.map((item) => {
          const isBusy = Boolean(item.loading);
          const isDisabled = Boolean(item.disabled) || isBusy;
          return (
            <Menu.Item
              key={item.key}
              color={item.destructive ? "danger" : undefined}
              disabled={isDisabled}
              leftSection={isBusy ? <Loader size="xs" aria-hidden /> : item.leftSection}
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
  );
}

function SecondaryDesktopButtons({
  items,
  stopPropagation,
}: {
  items: ActionMenuItem[];
  stopPropagation: boolean;
}) {
  return (
    <>
      {items.map((item) => {
        const isBusy = Boolean(item.loading);
        const isDisabled = Boolean(item.disabled) || isBusy;
        return (
          <Button
            key={item.key}
            variant="default"
            color={item.destructive ? "danger" : undefined}
            disabled={isDisabled}
            loading={isBusy}
            leftSection={!isBusy ? item.leftSection : undefined}
            onClick={(event) => {
              stopIfNeeded(event, stopPropagation);
              if (isDisabled) {
                return;
              }
              item.onClick?.();
            }}
          >
            {item.label}
          </Button>
        );
      })}
    </>
  );
}

/**
 * Primary action slot + secondary actions.
 * Desktop (`responsive`): secondary items as buttons. Mobile / `menu`: overflow.
 * Presentation only — permissions and confirmations stay in the consumer.
 * Uses Mantine Menu (Floating UI + portal) so the dropdown escapes ScrollArea.
 */
export function ActionMenu({
  primary,
  items = [],
  menuLabel = "Más acciones",
  mode = "responsive",
  stopPropagation = true,
}: ActionMenuProps) {
  const isBelowSm = useIsBelow("sm");
  const visibleItems = items.filter(Boolean);
  const useOverflowMenu = mode === "menu" || isBelowSm;

  return (
    <Group
      gap="xs"
      wrap="nowrap"
      justify="flex-end"
      onClick={(event) => stopIfNeeded(event, stopPropagation)}
      onKeyDown={(event) => {
        if (stopPropagation) {
          event.stopPropagation();
        }
      }}
    >
      {primary}

      {visibleItems.length > 0 ? (
        useOverflowMenu ? (
          <SecondaryOverflowMenu
            items={visibleItems}
            menuLabel={menuLabel}
            stopPropagation={stopPropagation}
          />
        ) : (
          <SecondaryDesktopButtons items={visibleItems} stopPropagation={stopPropagation} />
        )
      ) : null}
    </Group>
  );
}
