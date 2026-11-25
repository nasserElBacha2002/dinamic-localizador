import { useEffect, useState } from "react";
import { trackMarketingEvent } from "../analytics/marketing-events";
import { MarketingFooter } from "../components/MarketingFooter";
import { MarketingHeader } from "../components/MarketingHeader";
import {
  CLEANING_LANDING_DASHBOARD_IMAGE,
  CLEANING_LANDING_HERO,
  CLEANING_LANDING_SEO,
  CLEANING_LANDING_USE_CASE,
} from "../content/cleaning-landing-content";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import shared from "../styles/landing-shared.module.css";
import classes from "./cleaning-landing.module.css";

export function CleaningCompaniesLandingPage() {
  useDocumentMeta(CLEANING_LANDING_SEO);

  useEffect(() => {
    document.getElementById("cleaning-seo-prerender")?.remove();
  }, []);

  const [dashboardImageMissing, setDashboardImageMissing] = useState(false);

  return (
    <div className={`marketing-root ${classes.page}`}>
      <MarketingHeader marketingRoot="/" demoHref={CLEANING_LANDING_HERO.ctaPrimary.href} />
      <main>
        <section className={classes.hero} aria-labelledby="cleaning-hero-title">
          <div className={classes.heroInner}>
            <p className={shared.eyebrow}>Software para empresas de limpieza</p>
            <h1 id="cleaning-hero-title" className={shared.title}>
              {CLEANING_LANDING_HERO.title}
            </h1>
            <p className={shared.lead}>{CLEANING_LANDING_HERO.lead}</p>
            <p style={{ marginTop: "1.5rem" }}>
              <a
                className={shared.btnPrimary}
                href={CLEANING_LANDING_HERO.ctaPrimary.href}
                onClick={() => trackMarketingEvent("cta_demo_click", { location: "cleaning_hero" })}
              >
                {CLEANING_LANDING_HERO.ctaPrimary.label}
              </a>
            </p>
          </div>
        </section>

        <section className={classes.useCase} aria-labelledby="cleaning-use-case-title">
          <div className={shared.sectionInner}>
            <h2 id="cleaning-use-case-title" className="visually-hidden">
              Caso de uso en el tablero operativo
            </h2>
            <div className={classes.useCaseLayout}>
              <figure className={classes.useCaseFigure}>
                {dashboardImageMissing ? (
                  <div className={classes.imagePending} role="img" aria-label={CLEANING_LANDING_DASHBOARD_IMAGE.alt}>
                    Vista del tablero operativo (recurso gráfico en preparación).
                  </div>
                ) : (
                  <img
                    className={classes.dashboardImage}
                    src={CLEANING_LANDING_DASHBOARD_IMAGE.src}
                    alt={CLEANING_LANDING_DASHBOARD_IMAGE.alt}
                    width={CLEANING_LANDING_DASHBOARD_IMAGE.width}
                    height={CLEANING_LANDING_DASHBOARD_IMAGE.height}
                    loading="lazy"
                    decoding="async"
                    onError={() => setDashboardImageMissing(true)}
                  />
                )}
              </figure>
              <p className={classes.useCaseText}>{CLEANING_LANDING_USE_CASE.narrative}</p>
            </div>
          </div>
        </section>

        <section className={classes.finalCta} aria-labelledby="cleaning-final-cta">
          <div className={classes.finalCtaInner}>
            <h2 id="cleaning-final-cta" className={shared.title} style={{ fontSize: "clamp(1.5rem, 4vw, 2rem)" }}>
              Coordiná limpieza por edificio con visibilidad en tiempo real
            </h2>
            <p className={shared.lead} style={{ marginTop: "0.75rem" }}>
              Contanos tu operación y te mostramos el tablero en una demo guiada.
            </p>
            <p style={{ marginTop: "1.25rem" }}>
              <a
                className={shared.btnPrimary}
                href={CLEANING_LANDING_HERO.ctaPrimary.href}
                onClick={() => trackMarketingEvent("cta_demo_click", { location: "cleaning_footer_cta" })}
              >
                {CLEANING_LANDING_HERO.ctaPrimary.label}
              </a>
            </p>
          </div>
        </section>
      </main>
      <MarketingFooter marketingRoot="/" demoHref={CLEANING_LANDING_HERO.ctaPrimary.href} />
    </div>
  );
}