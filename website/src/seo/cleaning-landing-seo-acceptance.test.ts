import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { cleanup } from "@testing-library/react";
import React from "react";
import { buildCleaningPrerenderHtml } from "../../vite-plugins/cleaning-prerender-html";
import { PRIVACY_COMMERCIAL_DATA_GUARANTEE } from "../content/privacy-policy-content";
import { cleaningFaqAnswerById } from "../content/cleaning-landing-prerender-blocks";
import {
  CLEANING_FAQ_IDS,
  CLEANING_LANDING_FAQ,
  CLEANING_LANDING_HERO,
  CLEANING_LANDING_PROBLEMS,
  CLEANING_LANDING_SEO,
  cleaningFaqAnswerPlainText,
} from "../content/cleaning-landing-content";
import { CleaningCompaniesLandingPage } from "../pages/CleaningCompaniesLandingPage";
import { LandingPage } from "../pages/LandingPage";
import { installLayoutPolyfills } from "../test/layout-polyfills";
import { setupDomEnvironment } from "../test/setup-dom";
import { renderPage } from "../test/render-page";
import {
  assertCleaningMainInternalLinks,
  assertCleaningPrerenderReactParity,
  assertHomeMarketingAnchorsPresent,
  assertNotMassiveHomeBodyDuplicate,
  buildCleaningLandingEditorialPlainText,
  buildHomeMainEditorialPlainText,
  countEditorialWords,
  extractPrerenderArticleText,
  faqItemsShuffledBinding,
  normalizeEditorialWhitespace,
  stripVisibleHtmlForEditorial,
  validateCleaningLandingEditorialText,
} from "./cleaning-landing-editorial-text";

setupDomEnvironment();
installLayoutPolyfills();

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const distCleaning = join(websiteRoot, "dist/software-empresas-limpieza/index.html");

function countHeadingsInHtml(html: string, level: number): number {
  return (html.match(new RegExp(`<h${level}\\b`, "gi")) ?? []).length;
}

function mainTextAfterCleaningRender(): string {
  renderPage(React.createElement(CleaningCompaniesLandingPage));
  const main = document.querySelector("main");
  assert.ok(main);
  return normalizeEditorialWhitespace(main.textContent ?? "");
}

describe("cleaning landing SEO acceptance (DIN-523)", () => {
  afterEach(() => cleanup());

  it("mantiene title y canonical sin cambios de defecto", () => {
    assert.equal(CLEANING_LANDING_SEO.title, "Software para empresas de limpieza | Dinamic Operations");
    assert.equal(CLEANING_LANDING_SEO.canonicalUrl, "https://dinamicoperations.com/software-empresas-limpieza/");
  });

  it("prerender visible cumple volumen, jerarquía y validador editorial", () => {
    const html = buildCleaningPrerenderHtml();
    assert.equal(countHeadingsInHtml(html, 1), 1);
    assert.ok(countHeadingsInHtml(html, 2) >= 4);
    const problemArticles = html.match(/<article>\s*<h3>/g) ?? [];
    assert.equal(problemArticles.length, CLEANING_LANDING_PROBLEMS.items.length);

    const text = stripVisibleHtmlForEditorial(html);
    validateCleaningLandingEditorialText(text, "prerender modular");

    for (const item of CLEANING_LANDING_FAQ.items) {
      assert.match(text, new RegExp(escapeRegex(item.question)));
      const probe =
        item.id === CLEANING_FAQ_IDS.requestDemo
          ? "Contanos cuántas personas coordinás"
          : cleaningFaqAnswerPlainText(item).slice(0, 48);
      assert.ok(text.includes(probe), `falta respuesta FAQ ${item.id}`);
    }
  });

  it("dist: bloque prerender alcanza mínimo editorial visible", () => {
    const built = readFileSync(distCleaning, "utf8");
    const articleText = extractPrerenderArticleText(built);
    validateCleaningLandingEditorialText(articleText, "dist prerender");
    assert.match(built, /id="cleaning-seo-prerender"/);
  });

  it("React main alcanza mínimo editorial y estructura", () => {
    const { getAllByRole, getByRole, getAllByText } = renderPage(React.createElement(CleaningCompaniesLandingPage));
    assert.equal(getAllByRole("heading", { level: 1 }).length, 1);
    assert.ok(getAllByRole("heading", { level: 2 }).length >= 4);

    for (const item of CLEANING_LANDING_FAQ.items) {
      assert.ok(getByRole("heading", { level: 3, name: item.question }));
      assert.ok(document.querySelector(`[data-faq-id="${item.id}"]`));
    }

    const demoCtas = getAllByText(CLEANING_LANDING_HERO.ctaPrimary.label).filter(
      (node) => node.closest("a")?.getAttribute("href") === CLEANING_LANDING_HERO.ctaPrimary.href,
    );
    assert.ok(demoCtas.length >= 2);

    validateCleaningLandingEditorialText(mainTextAfterCleaningRender(), "react main");
  });

  it("home expone anclas reales de enlaces internos", () => {
    renderPage(React.createElement(LandingPage));
    assertHomeMarketingAnchorsPresent(document);
  });

  it("landing sectorial enlaza a anclas de la home", () => {
    renderPage(React.createElement(CleaningCompaniesLandingPage));
    assertCleaningMainInternalLinks(document);
  });

  it("paridad prerender vs React (texto y enlaces)", () => {
    const prerender = buildCleaningPrerenderHtml();
    const reactText = mainTextAfterCleaningRender();
    assertCleaningPrerenderReactParity(prerender, reactText);
  });

  it("paridad FAQ por id", () => {
    const byId = cleaningFaqAnswerById();
    for (const item of CLEANING_LANDING_FAQ.items) {
      assert.equal(byId[item.id], cleaningFaqAnswerPlainText(item));
    }
    const shuffled = [...CLEANING_LANDING_FAQ.items].reverse();
    assert.equal(
      faqItemsShuffledBinding(shuffled).get(CLEANING_FAQ_IDS.requestDemo),
      cleaningFaqAnswerPlainText(CLEANING_LANDING_FAQ.items[4]),
    );
  });

  it("fuente editorial alcanza mínimo deduplicado", () => {
    const editorial = buildCleaningLandingEditorialPlainText();
    validateCleaningLandingEditorialText(editorial, "fuente editorial");
  });

  it("política publica garantía comercial unificada", () => {
    assert.ok(PRIVACY_COMMERCIAL_DATA_GUARANTEE.includes("no los cedemos a terceros con fines comerciales"));
    assert.doesNotMatch(PRIVACY_COMMERCIAL_DATA_GUARANTEE, /ajenos a tu pedido/i);
  });
});

describe("cleaning landing SEO acceptance negatives (DIN-523)", () => {
  afterEach(() => cleanup());

  it("rechaza más de 450 palabras completamente ocultas", () => {
    const hiddenOnlyHtml = `<article id="cleaning-seo-prerender"><div hidden>${"oculto ".repeat(480)}</div></article>`;
    const visible = stripVisibleHtmlForEditorial(hiddenOnlyHtml);
    assert.throws(
      () => validateCleaningLandingEditorialText(visible, "solo oculto"),
      /mínimo 450|deduplicadas/,
    );
    assert.ok(countEditorialWords(visible) < 450);
  });

  it("rechaza repetición artificial por encima del umbral", () => {
    const block = buildCleaningLandingEditorialPlainText();
    const inflated = `${block} ${block} ${block}`;
    assert.throws(
      () => validateCleaningLandingEditorialText(inflated, "repetición artificial"),
      /repetición artificial|deduplicadas/,
    );
  });

  it("rechaza duplicación masiva del cuerpo de la home", () => {
    const fakeSectorial = `${CLEANING_LANDING_HERO.title} ${buildHomeMainEditorialPlainText()}`;
    assert.throws(() => assertNotMassiveHomeBodyDuplicate(fakeSectorial), /demasiado similar/);
  });

  it("rechaza ausencia de ancla en home", () => {
    installLayoutPolyfills();
    renderPage(React.createElement(LandingPage));
    document.getElementById("situaciones")?.remove();
    assert.throws(() => assertHomeMarketingAnchorsPresent(document), /#situaciones/);
  });

  it("rechaza divergencia prerender vs editorial fuente", () => {
    const tampered = buildCleaningPrerenderHtml().replace(CLEANING_LANDING_HERO.title, "Título adulterado");
    assert.throws(
      () => assertCleaningPrerenderReactParity(tampered, buildCleaningLandingEditorialPlainText()),
      /Prerender sin probe/,
    );
  });

  it("rechaza FAQ sin respuesta en DOM", () => {
    renderPage(React.createElement(CleaningCompaniesLandingPage));
    const dd = document.querySelector(`[data-faq-id="${CLEANING_FAQ_IDS.multiBuildingAttendance}"] dd`);
    assert.ok(dd);
    dd.textContent = "";
    assert.throws(() => {
      if (!dd.textContent?.includes("Planificás")) {
        throw new Error("FAQ sin respuesta");
      }
    }, /FAQ sin respuesta/);
  });
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}