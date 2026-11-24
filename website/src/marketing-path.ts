import { CLEANING_LANDING_SEO } from "./content/cleaning-landing-content";

export type MarketingRoute = "home" | "cleaning";

export function normalizeMarketingPathname(pathname: string): string {
  const raw = pathname.replace(/\/+$/, "") || "/";
  if (raw === "/software-empresas-limpieza") {
    return CLEANING_LANDING_SEO.pathname;
  }
  if (raw === "/") {
    return "/";
  }
  return raw;
}

export function resolveMarketingRoute(pathname: string): MarketingRoute {
  const normalized = normalizeMarketingPathname(pathname);
  if (normalized === CLEANING_LANDING_SEO.pathname) {
    return "cleaning";
  }
  return "home";
}