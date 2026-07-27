export type EntityAvatarEntityType =
  | "company"
  | "service"
  | "collaborator"
  | "operation";

export type EntityAvatarSize = "xs" | "sm" | "md" | "lg";

export type EntityAvatarShape = "square" | "rounded" | "circle";

export interface EntityAvatarPaletteEntry {
  /** Mantine CSS variable for background, e.g. var(--mantine-color-blue-1) */
  background: string;
  /** Mantine CSS variable for text */
  color: string;
}

export interface EntityAvatarProps {
  name?: string | null;
  entityType: EntityAvatarEntityType;
  size?: EntityAvatarSize;
  shape?: EntityAvatarShape;
  className?: string;
  /** Override initials length; defaults: collaborator=2, others=1 */
  maxInitials?: 1 | 2;
}
