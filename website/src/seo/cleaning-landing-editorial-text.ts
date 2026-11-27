import { HERO_CONTENT } from "../content/landing-content";
import { buildHomeEditorialPlainText } from "./home-landing-editorial-text";
import { CLEANING_LANDING_INTERNAL_LINKS } from "../content/cleaning-landing-content";
import {
  CLEANING_LANDING_FAQ,
  CLEANING_LANDING_FINAL_CTA,
  CLEANING_LANDING_HERO,
  CLEANING_LANDING_PROBLEMS,
  CLEANING_LANDING_TEAM_WORKFLOW,
  CLEANING_LANDING_TEAM_WORKFLOW_CLOSING,
  CLEANING_LANDING_USE_CASE,
  cleaningFaqAnswerPlainText,
  type CleaningFaqItem,
} from "../content/cleaning-landing-content";

export const CLEANING_LANDING_MIN_EDITORIAL_WORDS = 450;
export const HOME_MARKETING_ANCHOR_IDS = ["como-funciona", "situaciones", "solicitar-demo"] as const;

export function countEditorialWords(text: string): number {
  const normalized = normalizeEditorialWhitespace(text);
  if (!normalized) {
    return 0;
  }
  return normalized.match(/[\p{L}\p{N}']+/gu)?.length ?? 0;
}

export function normalizeEditorialWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function buildCleaningLandingEditorialPlainText(): string {
  const chunks: string[] = [
    CLEANING_LANDING_HERO.title,
    CLEANING_LANDING_HERO.lead,
    CLEANING_LANDING_USE_CASE.sectionTitle,
    CLEANING_LANDING_USE_CASE.narrative,
    CLEANING_LANDING_PROBLEMS.sectionTitle,
    CLEANING_LANDING_PROBLEMS.intro,
    ...CLEANING_LANDING_PROBLEMS.items.flatMap((item) => [
      item.title,
      item.problem,
      item.solution,
      item.benefit,
    ]),
    CLEANING_LANDING_TEAM_WORKFLOW.sectionTitle,
    ...CLEANING_LANDING_TEAM_WORKFLOW.paragraphs,
    teamWorkflowClosingPlainText(),
    CLEANING_LANDING_FAQ.sectionTitle,
    ...CLEANING_LANDING_FAQ.items.flatMap((item) => [
      item.question,
      cleaningFaqAnswerPlainText(item),
    ]),
    CLEANING_LANDING_FINAL_CTA.title,
    CLEANING_LANDING_FINAL_CTA.lead,
  ];
  return normalizeEditorialWhitespace(chunks.join(" "));
}

export function teamWorkflowClosingPlainText(): string {
  const c = CLEANING_LANDING_TEAM_WORKFLOW_CLOSING;
  return `${c.beforeComoFunciona}${c.comoFuncionaLabel}${c.betweenLinks}${c.situacionesLabel}${c.afterSituaciones}`;
}

/** Palabras editoriales sin inflar por oraciones duplicadas consecutivas. */
export function countDeduplicatedEditorialWords(text: string): number {
  const sentences = splitEditorialSentences(text);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const sentence of sentences) {
    const key = sentence.toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(sentence);
  }
  return countEditorialWords(unique.join(" "));
}

function splitEditorialSentences(text: string): string[] {
  return normalizeEditorialWhitespace(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function removeHiddenHtmlBlocks(html: string): string {
  let work = html;
  work = work.replace(/<([a-z][\w-]*)[^>]*\bhidden\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  work = work.replace(
    /<([a-z][\w-]*)[^>]*aria-hidden\s*=\s*["']true["'][^>]*>[\s\S]*?<\/\1>/gi,
    " ",
  );
  work = work.replace(
    /<([a-z][\w-]*)[^>]*style\s*=\s*["'][^"']*display\s*:\s*none[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
    " ",
  );
  work = work.replace(
    /<([a-z][\w-]*)[^>]*class\s*=\s*["'][^"']*visually-hidden[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
    " ",
  );
  return work;
}

export function stripHtmlForEditorial(html: string): string {
  return normalizeEditorialWhitespace(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

export function stripVisibleHtmlForEditorial(html: string): string {
  return stripHtmlForEditorial(removeHiddenHtmlBlocks(html));
}

export function extractPrerenderArticleText(fullHtml: string): string {
  const openTag = '<article id="cleaning-seo-prerender"';
  const openIdx = fullHtml.indexOf(openTag);
  const rootIdx = fullHtml.indexOf('<div id="root"', openIdx);
  if (openIdx === -1) {
    return stripVisibleHtmlForEditorial(fullHtml);
  }
  const endIdx = rootIdx === -1 ? fullHtml.lastIndexOf("</article>") + "</article>".length : rootIdx;
  const block = fullHtml.slice(openIdx, endIdx);
  return stripVisibleHtmlForEditorial(block);
}

export function validateCleaningLandingEditorialText(text: string, label: string): void {
  const visible = normalizeEditorialWhitespace(text);
  const rawWords = countEditorialWords(visible);
  const dedupedWords = countDeduplicatedEditorialWords(visible);
  if (dedupedWords < CLEANING_LANDING_MIN_EDITORIAL_WORDS) {
    throw new Error(`${label}: ${dedupedWords} palabras deduplicadas (mínimo ${CLEANING_LANDING_MIN_EDITORIAL_WORDS})`);
  }
  if (rawWords - dedupedWords > 120) {
    throw new Error(`${label}: repetición artificial (${rawWords} brutas vs ${dedupedWords} únicas)`);
  }
  assertNotHomeHeroDuplicate(visible);
  assertNotMassiveHomeBodyDuplicate(visible);
}

export function assertEditorialWordMinimum(text: string, label: string): void {
  validateCleaningLandingEditorialText(text, label);
}

export function assertNotHomeHeroDuplicate(editorial: string): void {
  if (editorial.includes(HERO_CONTENT.title)) {
    throw new Error("El contenido sectorial no debe repetir el H1 de la home.");
  }
}

export function buildHomeMainEditorialPlainText(): string {
  return buildHomeEditorialPlainText();
}

/** Rechaza si el cuerpo sectorial contiene porciones largas del texto principal de la home. */
export function assertNotMassiveHomeBodyDuplicate(editorial: string): void {
  const home = buildHomeMainEditorialPlainText();
  const probe = home.slice(0, 180);
  if (editorial.includes(probe)) {
    throw new Error("Contenido sectorial demasiado similar al cuerpo de la home.");
  }
}

export function assertHomeMarketingAnchorsPresent(document: Document): void {
  for (const id of HOME_MARKETING_ANCHOR_IDS) {
    if (!document.getElementById(id)) {
      throw new Error(`Falta ancla de home #${id}`);
    }
  }
}

export function assertCleaningMainInternalLinks(document: Document): void {
  const main = document.querySelector("main");
  if (!main) {
    throw new Error("Falta main en la landing sectorial");
  }
  for (const href of Object.values(CLEANING_LANDING_INTERNAL_LINKS)) {
    if (!main.querySelector(`a[href="${href}"]`)) {
      throw new Error(`Falta enlace visible hacia ${href}`);
    }
  }
}

export function assertCleaningPrerenderReactParity(prerenderHtml: string, reactMainText: string): void {
  const prerenderText = stripVisibleHtmlForEditorial(prerenderHtml);
  const reactText = normalizeEditorialWhitespace(reactMainText);
  const textProbes = [
    CLEANING_LANDING_HERO.title,
    CLEANING_LANDING_PROBLEMS.sectionTitle,
    CLEANING_LANDING_FAQ.sectionTitle,
    "Contanos cuántas personas coordinás",
    CLEANING_LANDING_TEAM_WORKFLOW_CLOSING.comoFuncionaLabel,
    CLEANING_LANDING_TEAM_WORKFLOW_CLOSING.situacionesLabel,
  ];
  for (const probe of textProbes) {
    if (!prerenderText.includes(probe)) {
      throw new Error(`Prerender sin probe: ${probe.slice(0, 40)}`);
    }
    if (!reactText.includes(probe)) {
      throw new Error(`React sin probe: ${probe.slice(0, 40)}`);
    }
  }
  for (const href of Object.values(CLEANING_LANDING_INTERNAL_LINKS)) {
    if (!prerenderHtml.includes(`href="${href}"`)) {
      throw new Error(`Prerender sin enlace ${href}`);
    }
  }
}

export function faqItemsShuffledBinding(items: ReadonlyArray<CleaningFaqItem>): Map<string, string> {
  return new Map(items.map((item) => [item.id, cleaningFaqAnswerPlainText(item)]));
}