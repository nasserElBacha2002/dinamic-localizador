import {
  LANDING_FAQ,
  LANDING_PDR_FRAMEWORK,
  landingFaqAnswerPlainText,
  type LandingFaqAnswerSegments,
  type LandingFaqItem,
} from "./landing-editorial";
import { COMMERCIAL_SECTION, HERO_CONTENT } from "./landing-content";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderFaqAnswerHtml(item: LandingFaqItem): string {
  if (typeof item.answer === "string") {
    return escapeHtml(item.answer);
  }
  return renderFaqSegmentsHtml(item.answer);
}

function renderFaqSegmentsHtml(segments: LandingFaqAnswerSegments): string {
  return segments
    .map((segment) =>
      segment.type === "text"
        ? escapeHtml(segment.value)
        : `<a href="${escapeHtml(segment.href)}">${escapeHtml(segment.label)}</a>`,
    )
    .join("");
}

export function renderLandingPdrHtml(): string {
  return LANDING_PDR_FRAMEWORK.pillars
    .map(
      (pillar) => `    <article>
      <h3>${escapeHtml(pillar.title)}</h3>
      <p>${escapeHtml(pillar.body)}</p>
    </article>`,
    )
    .join("\n");
}

export function renderLandingFaqHtml(): string {
  return LANDING_FAQ.items
    .map(
      (item) => `    <details data-faq-id="${escapeHtml(item.id)}">
      <summary><h3>${escapeHtml(item.question)}</h3></summary>
      <div class="home-faq-answer"><p>${renderFaqAnswerHtml(item)}</p></div>
    </details>`,
    )
    .join("\n");
}

export function landingFaqAnswerById(): Record<string, string> {
  return Object.fromEntries(LANDING_FAQ.items.map((item) => [item.id, landingFaqAnswerPlainText(item)]));
}

export function renderLandingCommercialFeaturesHtml(): string {
  return COMMERCIAL_SECTION.plan.features
    .map((feature) => `      <li>${escapeHtml(feature)}</li>`)
    .join("\n");
}

export function buildLandingPrerenderPlainTextProbes(): string[] {
  return [
    HERO_CONTENT.title,
    HERO_CONTENT.lead,
    LANDING_PDR_FRAMEWORK.sectionTitle,
    LANDING_FAQ.sectionTitle,
    ...LANDING_FAQ.items.map((item) => item.question),
  ];
}