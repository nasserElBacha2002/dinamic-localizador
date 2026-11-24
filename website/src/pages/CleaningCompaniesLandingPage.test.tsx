import { setupDomEnvironment } from "../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { cleanup } from "@testing-library/react";
import { renderPage } from "../test/render-page";
import { CLEANING_LANDING_HERO, CLEANING_LANDING_SEO } from "../content/cleaning-landing-content";
import { CleaningCompaniesLandingPage } from "./CleaningCompaniesLandingPage";

describe("CleaningCompaniesLandingPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("expone un único H1 y CTAs hacia el formulario comercial de la home", () => {
    const { getAllByRole, getAllByText } = renderPage(<CleaningCompaniesLandingPage />);
    const h1 = getAllByRole("heading", { level: 1 });
    assert.equal(h1.length, 1);
    assert.match(h1[0].textContent ?? "", new RegExp(escapeRegex(CLEANING_LANDING_HERO.title)));

    const demoLinks = getAllByText(/^Pedí una demo$/i).map(
      (node) => node.closest("a")?.getAttribute("href") ?? "",
    );
    assert.ok(demoLinks.length >= 1);
    assert.ok(demoLinks.every((href) => href === CLEANING_LANDING_HERO.ctaPrimary.href));
  });

  it("incluye el caso de uso del tablero operativo", () => {
    const { getByText } = renderPage(<CleaningCompaniesLandingPage />);
    assert.ok(getByText(/Son las 7 y arrancan tres servicios/i));
  });

  it("carga la captura del tablero cuando el asset existe", () => {
    const { container } = renderPage(<CleaningCompaniesLandingPage />);
    const img = container.querySelector('img[src="/marketing/cleaning-landing/tablero-operativo.webp"]');
    assert.ok(img);
    assert.ok(img?.getAttribute("alt")?.includes("Tablero operativo"));
  });
});

describe("CleaningCompaniesLandingPage document meta hook", () => {
  it("re-exporta canonical de la landing sectorial", () => {
    assert.equal(CLEANING_LANDING_SEO.canonicalUrl.endsWith("/"), true);
    assert.match(CLEANING_LANDING_SEO.canonicalUrl, /software-empresas-limpieza/);
  });
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}