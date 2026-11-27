import {
  buildHomeJsonLd,
  LANDING_FAQ,
  LANDING_INTERNAL_LINKS,
  LANDING_PDR_FRAMEWORK,
  LANDING_PRERENDER_ANCHORS,
  LANDING_PRERENDER_FALLBACK,
  LANDING_PUBLIC_CONTACT_EMAIL,
} from "../src/content/landing-editorial";
import { COMMERCIAL_SECTION, HERO_CONTENT, SITUATIONS_SUPPORTING_TEXT } from "../src/content/landing-content";
import {
  renderLandingCommercialFeaturesHtml,
  renderLandingFaqHtml,
  renderLandingPdrHtml,
} from "../src/content/landing-prerender-blocks";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** HTML semántico inicial para crawlers y fallback sin JS (fuente única: landing-content + landing-editorial). */
export function buildHomePrerenderHtml(): string {
  return `<article id="home-seo-prerender" data-home-seo-prerender class="home-seo-prerender">
  <header>
    <p>${escapeHtml(HERO_CONTENT.eyebrow)}</p>
    <h1>${escapeHtml(HERO_CONTENT.title)}</h1>
    <p>${escapeHtml(HERO_CONTENT.lead)}</p>
    <p>
      <a href="${escapeHtml(HERO_CONTENT.ctaPrimary.href)}">${escapeHtml(HERO_CONTENT.ctaPrimary.label)}</a>
      ·
      <a href="${escapeHtml(HERO_CONTENT.ctaSecondary.href)}">${escapeHtml(HERO_CONTENT.ctaSecondary.label)}</a>
    </p>
  </header>
  <section aria-labelledby="home-prerender-pdr">
    <h2 id="home-prerender-pdr">${escapeHtml(LANDING_PDR_FRAMEWORK.sectionTitle)}</h2>
    <p>${escapeHtml(LANDING_PDR_FRAMEWORK.intro)}</p>
${renderLandingPdrHtml()}
  </section>
  <section aria-labelledby="home-prerender-audience">
    <h2 id="home-prerender-audience">Para quién está pensado</h2>
    <p>${escapeHtml(SITUATIONS_SUPPORTING_TEXT)}</p>
    <p><a href="${escapeHtml(LANDING_INTERNAL_LINKS.limpieza)}">Software para empresas de limpieza</a></p>
  </section>
  <section aria-labelledby="home-prerender-commercial">
    <h2 id="home-prerender-commercial">${escapeHtml(COMMERCIAL_SECTION.title)}</h2>
    <p>${escapeHtml(COMMERCIAL_SECTION.lead)}</p>
    <ul>
${renderLandingCommercialFeaturesHtml()}
    </ul>
  </section>
  <section id="${escapeHtml(LANDING_PRERENDER_ANCHORS.comoFunciona)}" aria-labelledby="home-prerender-como-funciona">
    <h2 id="home-prerender-como-funciona">${escapeHtml(LANDING_PRERENDER_FALLBACK.comoFunciona.title)}</h2>
    <p>${escapeHtml(LANDING_PRERENDER_FALLBACK.comoFunciona.body)}</p>
  </section>
  <section id="${escapeHtml(LANDING_PRERENDER_ANCHORS.situaciones)}" aria-labelledby="home-prerender-situaciones">
    <h2 id="home-prerender-situaciones">${escapeHtml(LANDING_PRERENDER_FALLBACK.situaciones.title)}</h2>
    <p>${escapeHtml(LANDING_PRERENDER_FALLBACK.situaciones.body)}</p>
  </section>
  <section id="${escapeHtml(LANDING_PRERENDER_ANCHORS.solicitarDemo)}" aria-labelledby="home-prerender-solicitar-demo">
    <h2 id="home-prerender-solicitar-demo">${escapeHtml(LANDING_PRERENDER_FALLBACK.solicitarDemo.title)}</h2>
    <p>${escapeHtml(LANDING_PRERENDER_FALLBACK.solicitarDemo.body)} <a href="mailto:${escapeHtml(LANDING_PUBLIC_CONTACT_EMAIL)}">${escapeHtml(LANDING_PUBLIC_CONTACT_EMAIL)}</a> ${escapeHtml(LANDING_PRERENDER_FALLBACK.solicitarDemo.emailSuffix)} <a href="${escapeHtml(LANDING_INTERNAL_LINKS.privacidad)}">Política de privacidad</a>.</p>
  </section>
  <section id="${escapeHtml(LANDING_FAQ.sectionId)}" aria-labelledby="home-prerender-faq">
    <h2 id="home-prerender-faq">${escapeHtml(LANDING_FAQ.sectionTitle)}</h2>
${renderLandingFaqHtml()}
  </section>
  <nav aria-label="Enlaces del sitio (contenido estático)">
    <a href="${escapeHtml(LANDING_INTERNAL_LINKS.comoFunciona)}">Cómo funciona</a>
    ·
    <a href="${escapeHtml(LANDING_INTERNAL_LINKS.solicitarDemo)}">Solicitar demo</a>
    ·
    <a href="${escapeHtml(LANDING_INTERNAL_LINKS.privacidad)}">Privacidad</a>
  </nav>
</article>`;
}

export function buildHomeHeadSnippets(): string {
  const jsonLd = buildHomeJsonLd();
  return `${HOME_PRERENDER_STYLE_SNIPPET}
<script type="application/ld+json">${jsonLd}</script>`;
}

/** Sin ocultar el prerender por tener JS: solo estilos de fallback legible. */
export const HOME_PRERENDER_STYLE_SNIPPET = `<style>
  .home-seo-prerender { font-family: Inter, system-ui, sans-serif; color: #082433; max-width: 42rem; margin: 2rem auto; padding: 0 1rem 2rem; line-height: 1.55; }
  .home-seo-prerender a { color: #ff5a00; }
  .home-seo-prerender h2 { font-size: 1.35rem; margin: 1.75rem 0 0.75rem; }
  .home-seo-prerender h3 { font-size: 1.05rem; margin: 1rem 0 0.35rem; display: inline; font-weight: 600; }
  .home-seo-prerender summary { cursor: pointer; list-style: revert; margin: 0.75rem 0; }
  .home-seo-prerender details { border-bottom: 1px solid #e8eef2; padding-bottom: 0.5rem; margin-bottom: 0.5rem; }
  .home-seo-prerender .home-faq-answer { margin: 0.35rem 0 0.5rem; }
</style>`;