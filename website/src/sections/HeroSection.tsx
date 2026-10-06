import { useEffect } from "react";
import { trackMarketingEvent } from "../analytics/marketing-events";
import { SectionGuideCurve } from "../components/SectionGuideCurve";
import { LANDING_SEO } from "../content/landing-content";
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
                Tu operación, bajo control.
              </h1>
              <p className={shared.visuallyHidden}>{LANDING_SEO.seoHeadline}</p>
              <p className={`${shared.lead} ${classes.heroLeadShort} ${classes.heroLeadAlign}`}>
                Coordiná servicios, equipos y alertas desde un solo lugar, incluso cuando la operación
                cambia.
              </p>
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
