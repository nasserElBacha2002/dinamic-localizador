import { CLEANING_LANDING_SEO } from "./content/cleaning-landing-content";
import { PRIVACY_POLICY_SEO } from "./content/privacy-policy-content";

export type MarketingRoute = "home" | "cleaning" | "privacy";

export function normalizeMarketingPathname(pathname: string): string {
  const raw = pathname.replace(/\/+$/, "") || "/";
  if (raw === "/software-empresas-limpieza") {
    return CLEANING_LANDING_SEO.pathname;
  }
  if (raw === "/privacidad") {
    return PRIVACY_POLICY_SEO.pathname;
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
  if (normalized === PRIVACY_POLICY_SEO.pathname) {
    return "privacy";
  }
  return "home";
}