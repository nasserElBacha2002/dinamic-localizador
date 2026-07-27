import type { CSSProperties, ReactNode } from "react";
import {
  ENTITY_AVATAR_FONT_SIZE,
  ENTITY_AVATAR_SIZE_PX,
  ENTITY_IDENTITY_FALLBACK_LABEL,
} from "./entity-avatar.constants";
import type {
  EntityAvatarEntityType,
  EntityAvatarProps,
  EntityAvatarShape,
  EntityAvatarSize,
} from "./entity-avatar.types";
import {
  getDefaultAvatarShape,
  getDefaultMaxInitials,
  getEntityAvatarColor,
  getEntityInitials,
  resolveEntityIdentityDisplayName,
} from "./entity-avatar.utils";
import classes from "./entity-avatar.module.css";

const SHAPE_CLASS: Record<EntityAvatarShape, string> = {
  square: classes.shapeSquare,
  rounded: classes.shapeRounded,
  circle: classes.shapeCircle,
};

/**
 * Deterministic initials avatar for companies, services, collaborators, and operations.
 * Default: decorative (`aria-hidden`) when a visible name sits beside it.
 */
export function EntityAvatar(props: EntityAvatarProps) {
  const {
    name,
    entityType,
    size = "sm",
    shape,
    className,
    maxInitials,
    tone = "palette",
  } = props;

  const resolvedMax = maxInitials ?? getDefaultMaxInitials(entityType);
  const resolvedShape = shape ?? getDefaultAvatarShape(entityType);
  const initials = getEntityInitials(name, resolvedMax);
  const palette = getEntityAvatarColor(initials, entityType, tone);
  const pixelSize = ENTITY_AVATAR_SIZE_PX[size];

  const style: CSSProperties = {
    width: pixelSize,
    height: pixelSize,
    background: palette.background,
    color: palette.color,
    fontSize: ENTITY_AVATAR_FONT_SIZE[size],
  };

  const classNames = [classes.avatar, SHAPE_CLASS[resolvedShape], className]
    .filter(Boolean)
    .join(" ");

  const isDecorative = props.decorative !== false;

  if (isDecorative) {
    return (
      <span
        className={classNames}
        style={style}
        aria-hidden="true"
        data-entity-avatar={entityType}
      >
        {initials}
      </span>
    );
  }

  return (
    <span
      className={classNames}
      style={style}
      role="img"
      aria-label={props.ariaLabel}
      data-entity-avatar={entityType}
    >
      {initials}
    </span>
  );
}

export interface EntityIdentityProps {
  name?: string | null;
  entityType: EntityAvatarEntityType;
  subtitle?: ReactNode;
  size?: EntityAvatarSize;
  shape?: EntityAvatarShape;
  className?: string;
  /** Visible title when `name` is empty. Default: "Sin nombre". */
  fallbackLabel?: string;
}

/** Compact primary-cell layout: avatar + truncated title (+ optional subtitle). */
export function EntityIdentity({
  name,
  entityType,
  subtitle,
  size = "sm",
  shape,
  className,
  fallbackLabel = ENTITY_IDENTITY_FALLBACK_LABEL,
}: EntityIdentityProps) {
  const displayName = resolveEntityIdentityDisplayName(name, fallbackLabel);

  return (
    <div className={[classes.identity, className].filter(Boolean).join(" ")}>
      <EntityAvatar name={name} entityType={entityType} size={size} shape={shape} />
      <div className={classes.identityText}>
        <div className={classes.identityTitle}>{displayName}</div>
        {subtitle ? <div className={classes.identitySubtitle}>{subtitle}</div> : null}
      </div>
    </div>
  );
}
