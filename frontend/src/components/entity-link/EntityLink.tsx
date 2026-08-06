import type { MouseEvent } from "react";
import { Link, useLocation } from "react-router";
import type { EntityLinkProps } from "./entity-link.types";
import { resolveEntityDetailPath } from "./entity-route-registry";
import { useEntityLinkAccess } from "./use-entity-link-access";
import classes from "./EntityLink.module.css";

/**
 * Generic cross-entity navigation link.
 * Renders a non-interactive span when id, route, or permission is missing.
 */
export function EntityLink({
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
  const content = label;
  const plain = fallback ?? content;
  const plainClassName = [classes.entityPlain, className].filter(Boolean).join(" ");

  if (!path || disabled || access !== "allowed") {
    return (
      <span className={plainClassName} title={title}>
        {plain}
      </span>
    );
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
      {content}
    </Link>
  );
}
