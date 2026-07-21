import { Group } from "@mantine/core";
import { resolveCascadeParentChange } from "./cascading-filter-change";
import type { CascadingFilterChange } from "./cascading-filter-types";
import { FilterSelect, type FilterSelectOption } from "./FilterSelect";

export type { CascadingFilterChange } from "./cascading-filter-types";

export interface CascadingFilterSelectProps {
  parentLabel: string;
  parentValue: string;
  parentData: FilterSelectOption[];
  parentPlaceholder?: string;
  childLabel: string;
  childValue: string;
  childData: FilterSelectOption[];
  childPlaceholder?: string;
  /**
   * Emitted once when the parent changes. Always includes a cleared child (`""`)
   * so consumers can persist both values atomically.
   */
  onCascadeChange: (change: CascadingFilterChange) => void;
  onChildChange: (value: string) => void;
  clearable?: boolean;
  disabled?: boolean;
}

/**
 * Parent → child filter pair. Changing the parent clears the child in one event.
 * The child stays disabled until a parent value is selected.
 */
export function CascadingFilterSelect({
  parentLabel,
  parentValue,
  parentData,
  parentPlaceholder,
  childLabel,
  childValue,
  childData,
  childPlaceholder,
  onCascadeChange,
  onChildChange,
  clearable = true,
  disabled = false,
}: CascadingFilterSelectProps) {
  const childDisabled = disabled || !parentValue;

  return (
    <Group align="flex-end" gap="sm" wrap="nowrap" grow>
      <FilterSelect
        label={parentLabel}
        value={parentValue}
        onChange={(nextParent) => {
          const change = resolveCascadeParentChange(parentValue, nextParent);
          if (!change) {
            return;
          }
          onCascadeChange(change);
        }}
        data={parentData}
        placeholder={parentPlaceholder}
        clearable={clearable}
        disabled={disabled}
      />
      <FilterSelect
        label={childLabel}
        value={childValue}
        onChange={onChildChange}
        data={childData}
        placeholder={childPlaceholder}
        clearable={clearable}
        disabled={childDisabled}
      />
    </Group>
  );
}
