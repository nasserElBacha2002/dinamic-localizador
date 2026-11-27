import {
  CLEANING_LANDING_DASHBOARD_IMAGE,
  CLEANING_LANDING_FINAL_CTA,
  CLEANING_LANDING_FAQ,
  CLEANING_LANDING_HERO,
  CLEANING_LANDING_PROBLEMS,
  CLEANING_LANDING_TEAM_WORKFLOW,
  CLEANING_LANDING_USE_CASE,
} from "../src/content/cleaning-landing-content";
import {
  renderCleaningFaqHtml,
  renderCleaningProblemItemsHtml,
  renderCleaningTeamWorkflowHtml,
} from "../src/content/cleaning-landing-prerender-blocks";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** HTML semántico inicial para crawlers (fuente única: cleaning-landing-content). */
export function buildCleaningPrerenderHtml(): string {
  return `<article id="cleaning-seo-prerender" data-cleaning-seo-prerender class="cleaning-seo-prerender">
  <header>
    <p>Software para empresas de limpieza</p>
    <h1>${escapeHtml(CLEANING_LANDING_HERO.title)}</h1>
    <p>${escapeHtml(CLEANING_LANDING_HERO.lead)}</p>
    <p><a href="${escapeHtml(CLEANING_LANDING_HERO.ctaPrimary.href)}">${escapeHtml(CLEANING_LANDING_HERO.ctaPrimary.label)}</a></p>
  </header>
  <section aria-labelledby="cleaning-prerender-use-case">
    <h2 id="cleaning-prerender-use-case">${escapeHtml(CLEANING_LANDING_USE_CASE.sectionTitle)}</h2>
    <figure>
      <img src="${escapeHtml(CLEANING_LANDING_DASHBOARD_IMAGE.src)}" alt="${escapeHtml(CLEANING_LANDING_DASHBOARD_IMAGE.alt)}" width="${CLEANING_LANDING_DASHBOARD_IMAGE.width}" height="${CLEANING_LANDING_DASHBOARD_IMAGE.height}" decoding="async" />
      <figcaption>${escapeHtml(CLEANING_LANDING_USE_CASE.narrative)}</figcaption>
    </figure>
  </section>
  <section aria-labelledby="cleaning-prerender-problems">
    <h2 id="cleaning-prerender-problems">${escapeHtml(CLEANING_LANDING_PROBLEMS.sectionTitle)}</h2>
    <p>${escapeHtml(CLEANING_LANDING_PROBLEMS.intro)}</p>
${renderCleaningProblemItemsHtml()}
  </section>
  <section aria-labelledby="cleaning-prerender-team">
    <h2 id="cleaning-prerender-team">${escapeHtml(CLEANING_LANDING_TEAM_WORKFLOW.sectionTitle)}</h2>
${renderCleaningTeamWorkflowHtml()}
  </section>
  <section aria-labelledby="cleaning-prerender-faq">
    <h2 id="cleaning-prerender-faq">${escapeHtml(CLEANING_LANDING_FAQ.sectionTitle)}</h2>
${renderCleaningFaqHtml()}
  </section>
  <section aria-labelledby="cleaning-prerender-final-cta">
    <h2 id="cleaning-prerender-final-cta">${escapeHtml(CLEANING_LANDING_FINAL_CTA.title)}</h2>
    <p>${escapeHtml(CLEANING_LANDING_FINAL_CTA.lead)}</p>
    <p><a href="${escapeHtml(CLEANING_LANDING_HERO.ctaPrimary.href)}">${escapeHtml(CLEANING_LANDING_HERO.ctaPrimary.label)}</a></p>
  </section>
  <p><a href="/">Volver al inicio de Dinamic Operations</a></p>
</article>`;
}

export const CLEANING_PRERENDER_HEAD_SNIPPET = `<script>document.documentElement.classList.add("has-js");</script>
<style>
  html.has-js #cleaning-seo-prerender { display: none !important; }
  .cleaning-seo-prerender { font-family: Inter, system-ui, sans-serif; color: #082433; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
  .cleaning-seo-prerender a { color: #ff5a00; }
  .cleaning-seo-prerender img { max-width: 100%; height: auto; border-radius: 1rem; }
  .cleaning-seo-prerender h2 { font-size: 1.35rem; margin: 1.75rem 0 0.75rem; }
  .cleaning-seo-prerender h3 { font-size: 1.05rem; margin: 1.25rem 0 0.5rem; }
</style>`;