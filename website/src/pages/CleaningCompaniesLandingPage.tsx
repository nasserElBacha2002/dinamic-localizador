import { useEffect, useState, type ReactNode } from "react";
import { trackMarketingEvent } from "../analytics/marketing-events";
import { MarketingFooter } from "../components/MarketingFooter";
import { MarketingHeader } from "../components/MarketingHeader";
import {
  CLEANING_LANDING_DASHBOARD_IMAGE,
  CLEANING_LANDING_FAQ,
  CLEANING_LANDING_FINAL_CTA,
  CLEANING_LANDING_HERO,
  CLEANING_LANDING_INTERNAL_LINKS,
  CLEANING_LANDING_PROBLEMS,
  CLEANING_LANDING_SEO,
  CLEANING_LANDING_TEAM_WORKFLOW,
  CLEANING_LANDING_TEAM_WORKFLOW_CLOSING,
  CLEANING_LANDING_USE_CASE,
  type CleaningFaqItem,
} from "../content/cleaning-landing-content";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import shared from "../styles/landing-shared.module.css";
import classes from "./cleaning-landing.module.css";

function CleaningFaqAnswer({ item }: { item: CleaningFaqItem }) {
  if (typeof item.answer === "string") {
    return <>{item.answer}</>;
  }
  const nodes: ReactNode[] = item.answer.map((segment, index) => {
    if (segment.type === "text") {
      return segment.value;
    }
    return (
      <a key={`${item.id}-link-${index}`} href={segment.href}>
        {segment.label}
      </a>
    );
  });
  return <>{nodes}</>;
}

export function CleaningCompaniesLandingPage() {
  useDocumentMeta(CLEANING_LANDING_SEO);

  useEffect(() => {
    document.getElementById("cleaning-seo-prerender")?.remove();
  }, []);

  const [dashboardImageMissing, setDashboardImageMissing] = useState(false);
  const closing = CLEANING_LANDING_TEAM_WORKFLOW_CLOSING;

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
            <h2 id="cleaning-use-case-title" className={classes.sectionTitle}>
              {CLEANING_LANDING_USE_CASE.sectionTitle}
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

        <section className={classes.contentSection} aria-labelledby="cleaning-problems-title">
          <div className={shared.sectionInner}>
            <h2 id="cleaning-problems-title" className={classes.sectionTitle}>
              {CLEANING_LANDING_PROBLEMS.sectionTitle}
            </h2>
            <p className={classes.sectionIntro}>{CLEANING_LANDING_PROBLEMS.intro}</p>
            <div className={classes.problemGrid}>
              {CLEANING_LANDING_PROBLEMS.items.map((item) => (
                <article key={item.title} className={classes.problemCard}>
                  <h3 className={classes.problemTitle}>{item.title}</h3>
                  <p className={classes.problemText}>
                    <strong>El desafío:</strong> {item.problem}
                  </p>
                  <p className={classes.problemText}>
                    <strong>Cómo ayuda Dinamic Operations:</strong> {item.solution}
                  </p>
                  <p className={classes.problemText}>
                    <strong>Beneficio operativo:</strong> {item.benefit}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={classes.contentSectionAlt} aria-labelledby="cleaning-team-title">
          <div className={shared.sectionInner}>
            <h2 id="cleaning-team-title" className={classes.sectionTitle}>
              {CLEANING_LANDING_TEAM_WORKFLOW.sectionTitle}
            </h2>
            <div className={classes.prose}>
              {CLEANING_LANDING_TEAM_WORKFLOW.paragraphs.map((paragraph) => (
                <p key={paragraph} className={classes.proseParagraph}>
                  {paragraph}
                </p>
              ))}
              <p className={classes.proseParagraph}>
                {closing.beforeComoFunciona}
                <a href={CLEANING_LANDING_INTERNAL_LINKS.comoFunciona}>{closing.comoFuncionaLabel}</a>
                {closing.betweenLinks}
                <a href={CLEANING_LANDING_INTERNAL_LINKS.situaciones}>{closing.situacionesLabel}</a>
                {closing.afterSituaciones}
              </p>
            </div>
          </div>
        </section>

        <section className={classes.contentSection} aria-labelledby="cleaning-faq-title">
          <div className={shared.sectionInner}>
            <h2 id="cleaning-faq-title" className={classes.sectionTitle}>
              {CLEANING_LANDING_FAQ.sectionTitle}
            </h2>
            <dl className={classes.faqList}>
              {CLEANING_LANDING_FAQ.items.map((item) => (
                <div key={item.id} className={classes.faqItem} data-faq-id={item.id}>
                  <dt>
                    <h3 className={classes.faqQuestion}>{item.question}</h3>
                  </dt>
                  <dd className={classes.faqAnswer}>
                    <CleaningFaqAnswer item={item} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className={classes.finalCta} aria-labelledby="cleaning-final-cta">
          <div className={classes.finalCtaInner}>
            <h2 id="cleaning-final-cta" className={shared.title} style={{ fontSize: "clamp(1.5rem, 4vw, 2rem)" }}>
              {CLEANING_LANDING_FINAL_CTA.title}
            </h2>
            <p className={shared.lead} style={{ marginTop: "0.75rem" }}>
              {CLEANING_LANDING_FINAL_CTA.lead}
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