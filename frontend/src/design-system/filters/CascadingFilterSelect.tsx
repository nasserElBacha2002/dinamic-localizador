import { Group } from "@mantine/core";
import { FilterSelect, type FilterSelectOption } from "./FilterSelect";

export interface CascadingFilterSelectProps {
  parentLabel: string;
  parentValue: string;
  /**
   * Called when the parent changes. The child is always cleared to "".
   * Update both parent and child in a single state write — sequential URL
   * updates race and can drop the parent value.
   */
  onParentChange: (parent: string, clearedChild: "") => void;
  parentData: FilterSelectOption[];
  parentPlaceholder?: string;
  childLabel: string;
  childValue: string;
  onChildChange: (value: string) => void;
  childData: FilterSelectOption[];
  childPlaceholder?: string;
  clearable?: boolean;
  disabled?: boolean;
}

/**
 * Parent → child filter pair. Changing the parent clears the child.
 * The child stays disabled until a parent value is selected.
 */
export function CascadingFilterSelect({
  parentLabel,
  parentValue,
  onParentChange,
  parentData,
  parentPlaceholder,
  childLabel,
  childValue,
  onChildChange,
  childData,
  childPlaceholder,
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
          if (nextParent === parentValue) {
            return;
          }
          onParentChange(nextParent, "");
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
