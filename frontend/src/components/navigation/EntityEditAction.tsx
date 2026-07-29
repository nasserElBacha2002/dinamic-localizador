import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import { Link as RouterLink, useLocation } from "react-router";
import {
  getEntityEditPath,
  type EntityRouteKey,
} from "../../utils/entity-routes";

export interface EntityEditActionProps {
  entity: EntityRouteKey;
  id: string;
  /** When false, renders nothing (caller already checked manage permission). */
  visible?: boolean;
  label?: ReactNode;
}

/**
 * Primary “Editar” CTA for detail headers. Navigates to `/:id/edit`
 * and preserves current location.state (list context).
 */
export function EntityEditAction({
  entity,
  id,
  visible = true,
  label = "Editar",
}: EntityEditActionProps) {
  const location = useLocation();

  if (!visible) {
    return null;
  }

  return (
    <Button
      component={RouterLink}
      to={getEntityEditPath(entity, id)}
      state={location.state}
      aria-label={typeof label === "string" ? label : "Editar"}
    >
      {label}
    </Button>
  );
}
