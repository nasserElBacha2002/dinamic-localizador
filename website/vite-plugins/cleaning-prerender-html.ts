import {
  CLEANING_LANDING_DASHBOARD_IMAGE,
  CLEANING_LANDING_HERO,
  CLEANING_LANDING_USE_CASE,
} from "../src/content/cleaning-landing-content";

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
    <h2 id="cleaning-prerender-use-case">Caso de uso en el tablero operativo</h2>
    <figure>
      <img src="${escapeHtml(CLEANING_LANDING_DASHBOARD_IMAGE.src)}" alt="${escapeHtml(CLEANING_LANDING_DASHBOARD_IMAGE.alt)}" width="${CLEANING_LANDING_DASHBOARD_IMAGE.width}" height="${CLEANING_LANDING_DASHBOARD_IMAGE.height}" decoding="async" />
      <figcaption>${escapeHtml(CLEANING_LANDING_USE_CASE.narrative)}</figcaption>
    </figure>
    <p>${escapeHtml(CLEANING_LANDING_USE_CASE.narrative)}</p>
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
</style>`;