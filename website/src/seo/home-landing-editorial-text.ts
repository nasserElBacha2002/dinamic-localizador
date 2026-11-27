import {
  LANDING_FAQ,
  LANDING_PDR_FRAMEWORK,
  landingFaqAnswerPlainText,
} from "../content/landing-editorial";
import { COMMERCIAL_SECTION, HERO_CONTENT, LANDING_SEO, SITUATIONS, SITUATIONS_SUPPORTING_TEXT } from "../content/landing-content";
import {
  countDeduplicatedEditorialWords,
  countEditorialWords,
  normalizeEditorialWhitespace,
  removeHiddenHtmlBlocks,
  stripHtmlForEditorial,
  stripVisibleHtmlForEditorial,
} from "./cleaning-landing-editorial-text";

export const HOME_MIN_EDITORIAL_WORDS = 380;

export function buildHomeEditorialPlainText(): string {
  const chunks: string[] = [
    HERO_CONTENT.title,
    HERO_CONTENT.lead,
    LANDING_SEO.description,
    LANDING_PDR_FRAMEWORK.sectionTitle,
    LANDING_PDR_FRAMEWORK.intro,
    ...LANDING_PDR_FRAMEWORK.pillars.flatMap((p) => [p.title, p.body]),
    SITUATIONS_SUPPORTING_TEXT,
    COMMERCIAL_SECTION.title,
    COMMERCIAL_SECTION.lead,
    ...COMMERCIAL_SECTION.plan.features,
    LANDING_FAQ.sectionTitle,
    ...LANDING_FAQ.items.flatMap((item) => [item.question, landingFaqAnswerPlainText(item)]),
    ...SITUATIONS.flatMap((s) => [s.title, s.line]),
  ];
  return normalizeEditorialWhitespace(chunks.join(" "));
}

export function extractHomePrerenderArticleText(fullHtml: string): string {
  const openTag = '<article id="home-seo-prerender"';
  const openIdx = fullHtml.indexOf(openTag);
  const rootIdx = fullHtml.indexOf('<div id="root"', openIdx);
  if (openIdx === -1) {
    return stripVisibleHtmlForEditorial(fullHtml);
  }
  const endIdx = rootIdx === -1 ? fullHtml.lastIndexOf("</article>") + "</article>".length : rootIdx;
  const block = fullHtml.slice(openIdx, endIdx);
  return stripVisibleHtmlForEditorial(block);
}

export function validateHomeEditorialText(text: string, label: string): void {
  const visible = normalizeEditorialWhitespace(text);
  const rawWords = countEditorialWords(visible);
  const dedupedWords = countDeduplicatedEditorialWords(visible);
  if (dedupedWords < HOME_MIN_EDITORIAL_WORDS) {
    throw new Error(`${label}: ${dedupedWords} palabras deduplicadas (mínimo ${HOME_MIN_EDITORIAL_WORDS})`);
  }
  if (rawWords - dedupedWords > 140) {
    throw new Error(`${label}: repetición artificial (${rawWords} brutas vs ${dedupedWords} únicas)`);
  }
}

export function assertHomePrerenderReactParity(prerenderHtml: string, reactPlainText: string): void {
  const prerenderText = stripVisibleHtmlForEditorial(prerenderHtml);
  const reactText = normalizeEditorialWhitespace(reactPlainText);
  const probes = [HERO_CONTENT.title, LANDING_FAQ.sectionTitle, LANDING_FAQ.items[0].question];
  for (const probe of probes) {
    if (!prerenderText.includes(probe)) {
      throw new Error(`Prerender sin probe: ${probe.slice(0, 48)}`);
    }
    if (!reactText.includes(probe)) {
      throw new Error(`React sin probe: ${probe.slice(0, 48)}`);
    }
  }
}

export function assertHomeJsonLdInHtml(html: string): void {
  if (
    !html.includes('"@type":"WebApplication"') &&
    !html.includes('"@type": "WebApplication"') &&
    !html.includes('"@type":"SoftwareApplication"')
  ) {
    throw new Error("Falta WebApplication en JSON-LD");
  }
  if (!html.includes('"@type":"WebSite"') && !html.includes('"@type": "WebSite"')) {
    throw new Error("Falta WebSite en JSON-LD");
  }
}

/** Prerender no debe ocultarse solo por clase has-js (requisito DIN-471). */
export function assertHomePrerenderNotHiddenByDefaultCss(html: string): void {
  if (/has-js\s*#home-seo-prerender\s*\{\s*display\s*:\s*none/i.test(html)) {
    throw new Error("El prerender de home no debe ocultarse con html.has-js");
  }
}

export { stripHtmlForEditorial, removeHiddenHtmlBlocks };