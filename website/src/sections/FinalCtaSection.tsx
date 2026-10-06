import { trackMarketingEvent } from "../analytics/marketing-events";
import { RevealOnView } from "../components/RevealOnView";
import shared from "../styles/landing-shared.module.css";
import classes from "./sections.module.css";

export function FinalCtaSection() {
  return (
    <RevealOnView as="section" className={`${shared.section} ${classes.finalCta} ${shared.centered}`}>
      <div className={shared.sectionInner}>
        <h2 className={`${shared.title} ${classes.finalCtaTitle}`}>
          Menos tiempo coordinando.
          <br />
          Más servicios bajo control.
        </h2>
        <div className={classes.heroActions}>
          <a
            className={`${shared.btnPrimary} ${classes.finalCtaButton}`}
            href="#solicitar-demo"
            onClick={() => trackMarketingEvent("cta_demo_click", { location: "final" })}
          >
            Solicitar una demo
          </a>
        </div>
      </div>
    </RevealOnView>
  );
}
