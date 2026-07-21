import type { CascadingFilterChange } from "./cascading-filter-types";

export type { CascadingFilterChange } from "./cascading-filter-types";

/** Pure cascade decision used by CascadingFilterSelect and covered by behavior tests. */
export function resolveCascadeParentChange(
  currentParent: string,
  nextParent: string,
): CascadingFilterChange | null {
  if (nextParent === currentParent) {
    return null;
  }

  return {
    parentValue: nextParent,
    childValue: "",
  };
}
