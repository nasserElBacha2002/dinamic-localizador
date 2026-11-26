import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLEANING_LANDING_SEO } from "./content/cleaning-landing-content";
import { PRIVACY_POLICY_SEO } from "./content/privacy-policy-content";
import { normalizeMarketingPathname, resolveMarketingRoute } from "./marketing-path";

describe("marketing path", () => {
  it("resuelve la landing sectorial con o sin barra final", () => {
    assert.equal(resolveMarketingRoute("/software-empresas-limpieza"), "cleaning");
    assert.equal(resolveMarketingRoute("/software-empresas-limpieza/"), "cleaning");
    assert.equal(normalizeMarketingPathname("/software-empresas-limpieza"), CLEANING_LANDING_SEO.pathname);
  });

  it("mantiene home para la raíz", () => {
    assert.equal(resolveMarketingRoute("/"), "home");
    assert.equal(normalizeMarketingPathname("/"), "/");
  });

  it("resuelve la política de privacidad con o sin barra final", () => {
    assert.equal(resolveMarketingRoute("/privacidad"), "privacy");
    assert.equal(resolveMarketingRoute("/privacidad/"), "privacy");
    assert.equal(normalizeMarketingPathname("/privacidad"), PRIVACY_POLICY_SEO.pathname);
    assert.equal(normalizeMarketingPathname("/privacidad/"), PRIVACY_POLICY_SEO.pathname);
  });
});