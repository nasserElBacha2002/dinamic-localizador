import { PRIVACY_POLICY } from "../src/content/privacy-policy-content";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** HTML semántico inicial para crawlers (fuente única: privacy-policy-content). */
export function buildPrivacyPrerenderHtml(): string {
  const sections = PRIVACY_POLICY.sections
    .map(
      (section) => `  <section>
    <h2>${escapeHtml(section.title)}</h2>
    <p>${escapeHtml(section.body)}</p>
  </section>`,
    )
    .join("\n");

  return `<article id="privacy-seo-prerender" data-privacy-seo-prerender class="privacy-seo-prerender">
  <h1>${escapeHtml(PRIVACY_POLICY.heading)}</h1>
  <p>${escapeHtml(PRIVACY_POLICY.updated)}</p>
${sections}
  <p><a href="/">Inicio de Dinamic Operations</a></p>
</article>`;
}

export const PRIVACY_PRERENDER_HEAD_SNIPPET = `<script>document.documentElement.classList.add("has-js");</script>
<style>
  html.has-js #privacy-seo-prerender { display: none !important; }
  .privacy-seo-prerender { font-family: Inter, system-ui, sans-serif; color: #082433; max-width: 46rem; margin: 2rem auto; padding: 0 1rem 3rem; line-height: 1.6; }
  .privacy-seo-prerender h1 { font-size: 2rem; line-height: 1.15; margin: 0 0 0.75rem; }
  .privacy-seo-prerender h2 { font-size: 1.125rem; margin: 1.75rem 0 0.5rem; }
  .privacy-seo-prerender p { margin: 0; }
  .privacy-seo-prerender a { color: #ff5a00; }
</style>`;
