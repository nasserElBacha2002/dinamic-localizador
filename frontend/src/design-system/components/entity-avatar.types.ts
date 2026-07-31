export type EntityAvatarEntityType =
  | "company"
  | "service"
  | "collaborator"
  | "operation";

export type EntityAvatarSize = "xs" | "sm" | "md" | "lg";

export type EntityAvatarShape = "square" | "rounded" | "circle";

/** `palette` = deterministic hash; `brand` = design-system brand pair (company switcher). */
export type EntityAvatarTone = "palette" | "brand";

export interface EntityAvatarPaletteEntry {
  /** Mantine CSS variable for background, e.g. var(--mantine-color-blue-0) */
  background: string;
  /** Mantine CSS variable for text */
  color: string;
}

type EntityAvatarBaseProps = {
  name?: string | null;
  entityType: EntityAvatarEntityType;
  size?: EntityAvatarSize;
  shape?: EntityAvatarShape;
  className?: string;
  /** Override initials length; defaults: collaborator=2, others=1 */
  maxInitials?: 1 | 2;
  /** Color strategy. Default `palette`. Use `brand` for company switcher. */
  tone?: EntityAvatarTone;
};

/**
 * Decorative (default): name is visible beside the avatar.
 * Non-decorative: requires an explicit aria-label; exposes role="img".
 */
export type EntityAvatarAccessibility =
  | {
      decorative?: true;
      ariaLabel?: never;
    }
  | {
      decorative: false;
      ariaLabel: string;
    };

export type EntityAvatarProps = EntityAvatarBaseProps & EntityAvatarAccessibility;
