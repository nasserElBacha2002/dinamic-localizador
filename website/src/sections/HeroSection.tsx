import { useEffect } from "react";
import { trackMarketingEvent } from "../analytics/marketing-events";
import { SectionGuideCurve } from "../components/SectionGuideCurve";
import { LANDING_SEO, PILLARS } from "../content/landing-content";
import shared from "../styles/landing-shared.module.css";
import { HeroOperationsScene } from "./hero/HeroOperationsScene";
import classes from "./sections.module.css";
import { scrollToHash } from "./scroll";

export function HeroSection() {
  useEffect(() => {
    trackMarketingEvent("landing_view");
  }, []);

  return (
    <>
      <section
        className={`${shared.section} ${classes.hero} ${classes.heroScene} ${shared.centered}`}
        aria-labelledby="hero-title"
      >
        <div className={shared.sectionInner}>
          <p className={shared.eyebrow}>Control operativo para empresas de servicios</p>
          <h1 id="hero-title" className={shared.title}>
            Tu operación, bajo control.
          </h1>
          <p className={shared.visuallyHidden}>{LANDING_SEO.seoHeadline}</p>
          <p className={`${shared.lead} ${classes.heroLeadShort}`}>
            Planificá, detectá y resolvé — sin perder el control de cada servicio.
          </p>
          <div className={shared.pillars} aria-label="Concepto central">
            {PILLARS.map((pillar, index) => (
              <span key={pillar}>
                {pillar}
                {index < PILLARS.length - 1 ? " · " : ""}
              </span>
            ))}
          </div>
          <div className={classes.heroActions}>
            <a
              className={shared.btnPrimary}
              href="#solicitar-demo"
              onClick={() => trackMarketingEvent("cta_demo_click", { location: "hero" })}
            >
              Solicitar una demo
            </a>
            <button
              type="button"
              className={shared.btnGhost}
              onClick={() => {
                trackMarketingEvent("cta_how_it_works_click");
                scrollToHash("#como-funciona");
              }}
            >
              Ver cómo funciona
            </button>
          </div>
          <HeroOperationsScene />
        </div>
      </section>
      <SectionGuideCurve variant="hero" />
    </>
  );
}
