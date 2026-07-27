import { useMemo } from "react";
import { useLocation } from "react-router";
import { buildListNavigationState } from "../utils/list-navigation";

export function useListNavigationState(listPath: string) {
  const location = useLocation();

  return useMemo(
    () => buildListNavigationState(listPath, location),
    [listPath, location],
  );
}
