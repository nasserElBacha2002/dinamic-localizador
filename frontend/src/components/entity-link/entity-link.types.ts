import type { ReactNode } from "react";
import type {
  NavigableEntityDefinition,
  NavigableEntityType,
} from "../../routes/navigable-entity-definitions";

export type { NavigableEntityType };

export type EntityRouteDefinition = NavigableEntityDefinition;

export interface EntityLinkProps {
  entityType: NavigableEntityType;
  entityId?: string | number | null;
  label: ReactNode;
  disabled?: boolean;
  fallback?: ReactNode;
  /** Append current location search when navigating. Default false. */
  preserveQuery?: boolean;
  /**
   * Stop click bubbling. Default false — set true inside clickable rows/cards
   * so the parent row handler does not also fire.
   */
  stopPropagation?: boolean;
  className?: string;
  title?: string;
}
