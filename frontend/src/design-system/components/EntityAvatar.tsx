import type { CSSProperties, ReactNode } from "react";
import {
  ENTITY_AVATAR_FONT_SIZE,
  ENTITY_AVATAR_SIZE_PX,
} from "./entity-avatar.constants";
import type { EntityAvatarProps, EntityAvatarShape } from "./entity-avatar.types";
import {
  getDefaultAvatarShape,
  getDefaultMaxInitials,
  getEntityAvatarColor,
  getEntityInitials,
} from "./entity-avatar.utils";
import classes from "./entity-avatar.module.css";

const SHAPE_CLASS: Record<EntityAvatarShape, string> = {
  square: classes.shapeSquare,
  rounded: classes.shapeRounded,
  circle: classes.shapeCircle,
};

/**
 * Deterministic initials avatar for companies, services, collaborators, and operations.
 * Decorative when a visible name sits beside it (`aria-hidden`).
 */
export function EntityAvatar({
  name,
  entityType,
  size = "sm",
  shape,
  className,
  maxInitials,
}: EntityAvatarProps) {
  const resolvedMax = maxInitials ?? getDefaultMaxInitials(entityType);
  const resolvedShape = shape ?? getDefaultAvatarShape(entityType);
  const initials = getEntityInitials(name, resolvedMax);
  const palette = getEntityAvatarColor(initials, entityType);
  const pixelSize = ENTITY_AVATAR_SIZE_PX[size];

  const style: CSSProperties = {
    width: pixelSize,
    height: pixelSize,
    background: palette.background,
    color: palette.color,
    fontSize: ENTITY_AVATAR_FONT_SIZE[size],
  };

  return (
    <span
      className={[classes.avatar, SHAPE_CLASS[resolvedShape], className].filter(Boolean).join(" ")}
      style={style}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export interface EntityIdentityProps {
  name: string;
  entityType: EntityAvatarProps["entityType"];
  subtitle?: ReactNode;
  size?: EntityAvatarProps["size"];
  shape?: EntityAvatarProps["shape"];
  className?: string;
}

/** Compact primary-cell layout: avatar + truncated title (+ optional subtitle). */
export function EntityIdentity({
  name,
  entityType,
  subtitle,
  size = "sm",
  shape,
  className,
}: EntityIdentityProps) {
  return (
    <div className={[classes.identity, className].filter(Boolean).join(" ")}>
      <EntityAvatar name={name} entityType={entityType} size={size} shape={shape} />
      <div className={classes.identityText}>
        <div className={classes.identityTitle}>{name}</div>
        {subtitle ? <div className={classes.identitySubtitle}>{subtitle}</div> : null}
      </div>
    </div>
  );
}
