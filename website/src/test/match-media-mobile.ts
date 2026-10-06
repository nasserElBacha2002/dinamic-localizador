import { LANDING_MOBILE_MEDIA_QUERY } from "../constants/responsive";

export function installMobileMatchMedia(): () => void {
  const original = window.matchMedia.bind(window);

  window.matchMedia = (query: string): MediaQueryList => {
    if (query === LANDING_MOBILE_MEDIA_QUERY) {
      return {
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => true,
      } as MediaQueryList;
    }
    return original(query);
  };

  return () => {
    window.matchMedia = original;
  };
}
