/**
 * Drive `useIsBelow` / Mantine `useMediaQuery` in happy-dom tests.
 * Returns a stable MediaQueryList per query to avoid subscription churn.
 */

type ViewportMode = "mobile" | "desktop";

let currentMode: ViewportMode = "desktop";
const mediaQueryCache = new Map<string, MediaQueryList>();

function buildMediaQueryList(query: string): MediaQueryList {
  const isMaxWidthQuery = /max-width/i.test(query);
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  const mediaQueryList = {
    get matches() {
      return currentMode === "mobile" ? isMaxWidthQuery : false;
    },
    media: query,
    onchange: null,
    addListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    addEventListener: (
      _type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      if (typeof listener === "function") {
        listeners.add(listener as (event: MediaQueryListEvent) => void);
      }
    },
    removeEventListener: (
      _type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      if (typeof listener === "function") {
        listeners.delete(listener as (event: MediaQueryListEvent) => void);
      }
    },
    dispatchEvent: () => false,
  } as MediaQueryList;

  return mediaQueryList;
}

export function mockViewport(mode: ViewportMode): void {
  currentMode = mode;
  mediaQueryCache.clear();

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => {
      const cached = mediaQueryCache.get(query);
      if (cached) {
        return cached;
      }
      const next = buildMediaQueryList(query);
      mediaQueryCache.set(query, next);
      return next;
    },
  });
}
