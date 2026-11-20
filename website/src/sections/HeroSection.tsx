import { useEffect } from "react";
import { trackMarketingEvent } from "../analytics/marketing-events";
import { SectionGuideCurve } from "../components/SectionGuideCurve";
import { HERO_CONTENT } from "../content/landing-content";
import shared from "../styles/landing-shared.module.css";
import { ProblemChaosRoadmap } from "./problem/ProblemChaosRoadmap";
import classes from "./sections.module.css";

export function HeroSection() {
  useEffect(() => {
    trackMarketingEvent("landing_view");
  }, []);

  return (
    <>
      <section
        className={`${shared.section} ${classes.hero} ${classes.heroScene}`}
        aria-labelledby="hero-title"
      >
        <div className={shared.sectionInner}>
          <div className={classes.heroSplit}>
            <div className={classes.heroCopy}>
              <p className={shared.eyebrow}>Control operativo para empresas de servicios</p>
              <h1 id="hero-title" className={shared.title}>
                {HERO_CONTENT.title}
              </h1>
              <p className={`${shared.lead} ${classes.heroLeadShort} ${classes.heroLeadAlign}`}>
                {HERO_CONTENT.lead}
              </p>
              <div className={classes.heroActions}>
                <a
                  className={shared.btnPrimary}
                  href={HERO_CONTENT.ctaPrimary.href}
                  onClick={() => trackMarketingEvent("cta_demo_click", { location: "hero" })}
                >
                  {HERO_CONTENT.ctaPrimary.label}
                </a>
                <a
                  className={shared.btnGhost}
                  href={HERO_CONTENT.ctaSecondary.href}
                  onClick={() =>
                    trackMarketingEvent("cta_how_it_works_click", { location: "hero" })
                  }
                >
                  {HERO_CONTENT.ctaSecondary.label}
                </a>
              </div>
            </div>
            <div className={classes.heroChaos}>
              <ProblemChaosRoadmap showMicrocopy={false} className={classes.chaosRoadmapHero} />
            </div>
          </div>
        </div>
      </section>
      <SectionGuideCurve variant="hero" />
    </>
  );
}
