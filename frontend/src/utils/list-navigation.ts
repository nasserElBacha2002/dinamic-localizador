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

export function resolveListReturnPath(defaultListPath: string, state: unknown): string {
  if (!state || typeof state !== "object") {
    return defaultListPath;
  }

  const navState = state as Partial<ListNavigationState>;
  const fromList = navState.fromList;
  const contextListPath = navState.listPath ?? defaultListPath;

  if (typeof fromList !== "string" || fromList.length === 0) {
    return defaultListPath;
  }

  const normalizedListPath = contextListPath.endsWith("/")
    ? contextListPath.slice(0, -1)
    : contextListPath;
  const normalizedFromList = fromList.split("?")[0];

  if (
    normalizedFromList === normalizedListPath ||
    normalizedFromList.startsWith(`${normalizedListPath}/`)
  ) {
    return fromList;
  }

  return defaultListPath;
}

export function navigateWithListContext(
  navigate: (to: string, options?: { state?: ListNavigationState }) => void,
  targetPath: string,
  listPath: string,
  location: ListLocation,
): void {
  navigate(targetPath, { state: buildListNavigationState(listPath, location) });
}
