import { setupDomEnvironment } from "../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { cleanup } from "@testing-library/react";
import { CLEANING_LANDING_HERO, CLEANING_LANDING_SEO } from "../content/cleaning-landing-content";
import { renderPage } from "../test/render-page";
import { CleaningCompaniesLandingPage } from "./CleaningCompaniesLandingPage";

describe("CleaningCompaniesLandingPage DOM metadata", () => {
  afterEach(() => cleanup());

  it("sincroniza title, description, canonical y og:url en document después del render", () => {
    document.head.innerHTML = "";
    document.title = "placeholder";
    renderPage(<CleaningCompaniesLandingPage />);

    assert.equal(document.title, CLEANING_LANDING_SEO.title);
    const description = document.querySelector('meta[name="description"]')?.getAttribute("content");
    assert.equal(description, CLEANING_LANDING_SEO.description);
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href");
    assert.equal(canonical, CLEANING_LANDING_SEO.canonicalUrl);
    assert.equal(document.querySelector('meta[property="og:title"]')?.getAttribute("content"), CLEANING_LANDING_SEO.title);
    assert.equal(
      document.querySelector('meta[property="og:description"]')?.getAttribute("content"),
      CLEANING_LANDING_SEO.description,
    );
    assert.equal(document.querySelector('meta[property="og:url"]')?.getAttribute("content"), CLEANING_LANDING_SEO.canonicalUrl);
  });

  it("elimina #cleaning-seo-prerender y deja un único H1 visible", () => {
    const prerender = document.createElement("article");
    prerender.id = "cleaning-seo-prerender";
    prerender.innerHTML = `<h1>${CLEANING_LANDING_HERO.title}</h1>`;
    document.body.prepend(prerender);
    renderPage(<CleaningCompaniesLandingPage />);
    assert.equal(document.getElementById("cleaning-seo-prerender"), null);
    const h1 = document.querySelectorAll("h1");
    assert.equal(h1.length, 1);
  });
});