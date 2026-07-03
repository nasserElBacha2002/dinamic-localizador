import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { resolveListReturnPath } from "../utils/list-navigation";

export function useListBackNavigation(listPath: string) {
  const navigate = useNavigate();
  const location = useLocation();

  const returnPath = useMemo(
    () => resolveListReturnPath(listPath, location.state),
    [listPath, location.state],
  );

  const goBackToList = useCallback(() => {
    navigate(returnPath);
  }, [navigate, returnPath]);

  return { goBackToList, listPath, returnPath };
}
