import type { MouseEvent } from "react";
import { Link, useLocation } from "react-router";
import { useIsTableEntityReference } from "../../design-system/components/table-entity-reference-context";
import type { EntityLinkProps } from "./entity-link.types";
import { resolveEntityDetailPath } from "./entity-route-registry";
import { useEntityLinkAccess } from "./use-entity-link-access";
import classes from "./EntityLink.module.css";

/**
 * Generic cross-entity navigation link.
 * Renders a non-interactive span when id, route, or permission is missing.
 */
function EntityLinkPlain({
  label,
  fallback,
  className,
  title,
}: Pick<EntityLinkProps, "label" | "fallback" | "className" | "title">) {
  const plain = fallback ?? label;
  const plainClassName = [classes.entityPlain, className].filter(Boolean).join(" ");

  return (
    <span className={plainClassName} title={title}>
      {plain}
    </span>
  );
}

function NavigableEntityLink({
  entityType,
  entityId,
  label,
  disabled = false,
  fallback,
  preserveQuery = false,
  stopPropagation = false,
  className,
  title,
}: EntityLinkProps) {
  const location = useLocation();
  const access = useEntityLinkAccess(entityType);
  const path = resolveEntityDetailPath(entityType, entityId);

  if (!path || disabled || access !== "allowed") {
    return <EntityLinkPlain label={label} fallback={fallback} className={className} title={title} />;
  }

  const to = preserveQuery && location.search ? `${path}${location.search}` : path;
  const classNames = [classes.entityLink, className].filter(Boolean).join(" ");

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (stopPropagation) {
      event.stopPropagation();
    }
  };

  return (
    <Link
      to={to}
      className={classNames}
      title={title}
      onClick={handleClick}
      data-entity-link={entityType}
    >
      {label}
    </Link>
  );
}

export function EntityLink(props: EntityLinkProps) {
  const isTableEntityReference = useIsTableEntityReference();

  if (isTableEntityReference) {
    return <EntityLinkPlain {...props} />;
  }

  return <NavigableEntityLink {...props} />;
}
