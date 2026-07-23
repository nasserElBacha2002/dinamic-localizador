/**
 * Drive `useIsBelow` / Mantine `useMediaQuery` in happy-dom tests.
 */
export function mockViewport(mode: "mobile" | "desktop"): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => {
      const isMaxWidthQuery = /max-width/i.test(query);
      return {
        matches: mode === "mobile" ? isMaxWidthQuery : false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      };
    },
  });
}
