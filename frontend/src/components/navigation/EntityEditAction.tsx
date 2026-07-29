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
  label?: ReactNode;
}

/**
 * Primary “Editar” CTA for detail headers. Navigates to `/:id/edit`
 * and preserves current location.state (list context).
 *
 * Authorization is the caller’s responsibility — only render this when the user can manage/edit.
 */
export function EntityEditAction({
  entity,
  id,
  label = "Editar",
}: EntityEditActionProps) {
  const location = useLocation();

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
