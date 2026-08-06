import { createContext, useContext } from "react";
import type { EntityLinkAccessContext } from "./evaluate-entity-link-access";

export const EntityLinkAccessReactContext = createContext<EntityLinkAccessContext | null>(null);

export function useEntityLinkAccessContext(): EntityLinkAccessContext | null {
  return useContext(EntityLinkAccessReactContext);
}
