import { setupDomEnvironment } from "../test/setup-dom";
import { installLayoutPolyfills } from "../test/layout-polyfills";

setupDomEnvironment();
installLayoutPolyfills();

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { cleanup } from "@testing-library/react";
import { buildHomePrerenderHtml } from "../../vite-plugins/home-prerender-html";
import { LANDING_FAQ, landingFaqAnswerPlainText } from "../content/landing-editorial";
import { HERO_CONTENT, LANDING_SEO } from "../content/landing-content";
import { landingFaqAnswerById } from "../content/landing-prerender-blocks";
import { renderPage } from "../test/render-page";
import React from "react";
import { LandingPage } from "../pages/LandingPage";
import {
  assertHomeJsonLdInHtml,
  assertHomePrerenderNotHiddenByDefaultCss,
  assertHomePrerenderReactParity,
  buildHomeEditorialPlainText,
  extractHomePrerenderArticleText,
  stripHtmlForEditorial,
  validateHomeEditorialText,
} from "./home-landing-editorial-text";
import { requireDistOrGate } from "../test/din-506-gate";
import {
  assertHomeInitialHtmlFragmentTargets,
  assertMarketingInternalLinkFragmentsResolvable,
} from "./home-prerender-fragments";

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const distIndex = join(websiteRoot, "dist/index.html");

afterEach(() => {
  cleanup();
});

describe("home landing SEO (DIN-471)", () => {
  it("prerender incluye H1, PDR, FAQ y JSON-LD sin ocultar por has-js", () => {
    const html = buildHomePrerenderHtml();
    const wrapped = `<!doctype html><html><head></head><body>${html}<div id="root"></div></body></html>`;
    const articleText = extractHomePrerenderArticleText(wrapped);
    validateHomeEditorialText(articleText, "prerender modular");
    assert.match(html, new RegExp(`<h1>${escapeRegex(HERO_CONTENT.title)}</h1>`));
    for (const item of LANDING_FAQ.items) {
      assert.match(html, new RegExp(escapeRegex(item.question)));
      const plain = landingFaqAnswerPlainText(item);
      assert.ok(articleText.includes(plain.slice(0, Math.min(48, plain.length))), `falta FAQ ${item.id}`);
    }
    assertHomePrerenderNotHiddenByDefaultCss("");
  });

  it("dist: home incluye prerender, canonical y structured data", async (t) => {
    const skip = requireDistOrGate(existsSync(distIndex), "dist home prerender");
    if (skip) {
      t.skip(skip);
      return;
    }
    const built = readFileSync(distIndex, "utf8");
    assert.match(built, /id="home-seo-prerender"/);
    assert.match(built, new RegExp(escapeRegex(LANDING_SEO.title)));
    assert.match(built, /rel="canonical" href="https:\/\/dinamicoperations\.com\/"/);
    assertHomeJsonLdInHtml(built);
    assertHomePrerenderNotHiddenByDefaultCss(built);
    validateHomeEditorialText(extractHomePrerenderArticleText(built), "dist index");
  });

  it("paridad FAQ por id", () => {
    const byId = landingFaqAnswerById();
    for (const item of LANDING_FAQ.items) {
      assert.equal(byId[item.id], landingFaqAnswerPlainText(item));
    }
  });

  it("paridad prerender vs React (texto principal)", () => {
    const prerender = buildHomePrerenderHtml();
    const { container } = renderPage(React.createElement(LandingPage));
    const main = container.querySelector("main");
    assert.ok(main);
    const reactText = main.textContent ?? "";
    assertHomePrerenderReactParity(prerender, `${HERO_CONTENT.lead} ${reactText}`);
    assert.equal(document.getElementById("home-seo-prerender"), null);
    assert.equal(container.querySelectorAll("h1").length, 1);
  });

  it("ancla FAQ accesible en DOM", () => {
    const { container, getByRole } = renderPage(React.createElement(LandingPage));
    assert.ok(container.querySelector("#preguntas-frecuentes"));
    assert.ok(getByRole("heading", { level: 2, name: LANDING_FAQ.sectionTitle }));
    for (const item of LANDING_FAQ.items) {
      assert.ok(container.querySelector(`[data-faq-id="${item.id}"]`));
    }
  });

  it("editorial plano alcanza mínimo sin inflar", () => {
    const text = buildHomeEditorialPlainText();
    validateHomeEditorialText(text, "fuente editorial");
  });

  it("enlaces de fragmento del HTML inicial apuntan a ids existentes", () => {
    assertMarketingInternalLinkFragmentsResolvable();
    const prerender = buildHomePrerenderHtml();
    const wrapped = `<!doctype html><html><body>${prerender}<div id="root"></div></body></html>`;
    assertHomeInitialHtmlFragmentTargets(wrapped);
  });

  it("paridad completa de las 10 FAQ entre prerender y fuente editorial", () => {
    const prerender = buildHomePrerenderHtml();
    for (const item of LANDING_FAQ.items) {
      const plain = landingFaqAnswerPlainText(item);
      assert.ok(prerender.includes(item.question), `pregunta ${item.id}`);
      const detailBlock =
        prerender.match(new RegExp(`<details data-faq-id="${item.id}"[\\s\\S]*?</details>`))?.[0] ?? "";
      assert.ok(detailBlock, `bloque FAQ prerender ${item.id}`);
      const answerOnly =
        detailBlock.match(/<div class="home-faq-answer">[\s\S]*?<\/div>/)?.[0] ?? detailBlock;
      const answerText = normalizeFaqAnswerText(stripHtmlForEditorial(answerOnly));
      assert.equal(answerText, normalizeFaqAnswerText(plain), `respuesta completa FAQ ${item.id}`);
    }
    const { container } = renderPage(React.createElement(LandingPage));
    for (const item of LANDING_FAQ.items) {
      const node = container.querySelector(`[data-faq-id="${item.id}"]`);
      assert.ok(node, `React FAQ nodo ${item.id}`);
      assert.ok(node.textContent?.includes(item.question), `React FAQ pregunta ${item.id}`);
      const plain = landingFaqAnswerPlainText(item);
      const answerNode = node.querySelector("p");
      assert.equal(
        normalizeFaqAnswerText(answerNode?.textContent ?? ""),
        normalizeFaqAnswerText(plain),
        `React FAQ respuesta ${item.id}`,
      );
    }
  });

  it("hero, lead y pilares PDR presentes en prerender y React", () => {
    const prerender = buildHomePrerenderHtml();
    assert.ok(prerender.includes(HERO_CONTENT.title));
    assert.ok(prerender.includes(HERO_CONTENT.lead));
    const { container } = renderPage(React.createElement(LandingPage));
    const text = container.textContent ?? "";
    assert.ok(text.includes(HERO_CONTENT.title));
    assert.ok(text.includes(HERO_CONTENT.lead));
    assert.equal(container.querySelectorAll("h1").length, 1);
  });
});

function normalizeFaqAnswerText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}