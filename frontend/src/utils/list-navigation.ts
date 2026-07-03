export interface ListNavigationState {
  fromList: string;
  listPath: string;
}

export type ListLocation = {
  pathname: string;
  search: string;
};

export function buildListNavigationState(
  listPath: string,
  location: ListLocation,
): ListNavigationState {
  return {
    fromList: `${location.pathname}${location.search}`,
    listPath,
  };
}

export function resolveListReturnPath(listPath: string, state: unknown): string {
  if (!state || typeof state !== "object" || !("fromList" in state)) {
    return listPath;
  }

  const fromList = (state as ListNavigationState).fromList;
  if (typeof fromList !== "string" || fromList.length === 0) {
    return listPath;
  }

  const normalizedListPath = listPath.endsWith("/") ? listPath.slice(0, -1) : listPath;
  const normalizedFromList = fromList.split("?")[0];

  if (
    normalizedFromList === normalizedListPath ||
    normalizedFromList.startsWith(`${normalizedListPath}/`)
  ) {
    return fromList;
  }

  return listPath;
}

export function navigateWithListContext(
  navigate: (to: string, options?: { state?: ListNavigationState }) => void,
  targetPath: string,
  listPath: string,
  location: ListLocation,
): void {
  navigate(targetPath, { state: buildListNavigationState(listPath, location) });
}
