import { setupDomEnvironment } from "../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { cleanup } from "@testing-library/react";
import {
  DEMO_FORM_PRIVACY_NOTICE,
  PRIVACY_COMMERCIAL_DATA_GUARANTEE,
  PRIVACY_POLICY,
  PRIVACY_POLICY_SEO,
} from "../content/privacy-policy-content";
import { renderPage } from "../test/render-page";
import { PrivacyPolicyPage } from "./PrivacyPolicyPage";

describe("PrivacyPolicyPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("muestra el texto de la política y el enlace del footer", () => {
    const { getAllByRole, getByRole } = renderPage(<PrivacyPolicyPage />);
    const h1 = getAllByRole("heading", { level: 1 });
    assert.equal(h1.length, 1);
    assert.equal(h1[0].textContent, PRIVACY_POLICY.heading);
    assert.ok(getByRole("heading", { level: 2, name: "1. Responsable" }));
    assert.ok(getByRole("heading", { level: 2, name: "9. Cambios" }));

    for (const section of PRIVACY_POLICY.sections) {
      assert.equal(document.body.textContent?.includes(section.body), true);
    }
    assert.ok(document.body.textContent?.includes("LinkedIn"));
    assert.ok(document.body.textContent?.includes(PRIVACY_COMMERCIAL_DATA_GUARANTEE));
    assert.ok(document.body.textContent?.includes("nombre, apellido y email laboral"));
    assert.match(document.body.textContent ?? "", /Solo accede Nasser El Bacha/);

    const privacyLinks = getAllByRole("link", { name: "Política de privacidad" });
    assert.ok(privacyLinks.some((link) => link.getAttribute("href") === PRIVACY_POLICY_SEO.pathname));
    assert.equal(document.body.textContent?.includes(DEMO_FORM_PRIVACY_NOTICE), false);
  });

  it("deja title y canonical indexables", () => {
    renderPage(<PrivacyPolicyPage />);
    assert.equal(document.title, PRIVACY_POLICY_SEO.title);
    assert.equal(document.querySelector('link[rel="canonical"]')?.getAttribute("href"), PRIVACY_POLICY_SEO.canonicalUrl);
    assert.equal(document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "", "");
  });
});
