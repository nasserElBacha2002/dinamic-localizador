import { trackMarketingEvent } from "../analytics/marketing-events";
import { COMMERCIAL_SECTION } from "../content/landing-content";
import { useInView } from "../hooks/useInView";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import shared from "../styles/landing-shared.module.css";
import classes from "./sections.module.css";

function CommercialStepIcon({ kind }: { kind: "platform" | "guide" | "launch" }) {
  return (
    <span className={classes.commercialStepIcon} aria-hidden="true">
      {kind === "platform" ? (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75">
          <rect x="3" y="4" width="18" height="14" rx="2" />
          <path d="M8 20h8" strokeLinecap="round" />
        </svg>
      ) : null}
      {kind === "guide" ? (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M4 6h16M4 12h10M4 18h14" strokeLinecap="round" />
        </svg>
      ) : null}
      {kind === "launch" ? (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M5 17l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 10V4" strokeLinecap="round" />
        </svg>
      ) : null}
    </span>
  );
}

export function CommercialSection() {
  const { eyebrow, title, lead, steps, plan } = COMMERCIAL_SECTION;
  const reducedMotion = usePrefersReducedMotion();
  const { ref, inView } = useInView<HTMLElement>({ threshold: 0.18, once: true });

  return (
    <section
      ref={ref}
      id="comercial"
      className={`${shared.section} ${classes.commercialSection}`}
      aria-labelledby="commercial-title"
      data-testid="commercial-section"
      data-in-view={inView ? "true" : "false"}
      data-reduced={reducedMotion ? "true" : "false"}
    >
      <div className={shared.sectionInner}>
        <header className={classes.commercialIntro}>
          <p className={shared.eyebrow}>{eyebrow}</p>
          <h2 id="commercial-title" className={shared.title}>
            {title}
          </h2>
          <p className={`${shared.lead} ${classes.commercialLead}`}>{lead}</p>
        </header>

        <ol className={classes.commercialSteps} aria-label="Proceso de incorporación">
          {steps.map((step, index) => (
            <li key={step.id} className={classes.commercialStep}>
              <CommercialStepIcon kind={step.icon} />
              <div className={classes.commercialStepBody}>
                <h3 className={classes.commercialStepTitle}>{step.title}</h3>
                <p className={classes.commercialStepDescription}>{step.description}</p>
              </div>
              {index < steps.length - 1 ? (
                <span className={classes.commercialStepDivider} aria-hidden="true" />
              ) : null}
            </li>
          ))}
        </ol>

        <div className={classes.commercialPlanReveal}>
          <article
            className={classes.commercialPlanCard}
            aria-labelledby="launch-plan-title"
            data-testid="launch-plan-card"
          >
            <div className={classes.commercialPlanGrid}>
              <div className={classes.commercialPlanLeft}>
                <p className={classes.commercialLaunchBadge}>{plan.launchStageLabel}</p>
                <h3 id="launch-plan-title" className={classes.commercialPlanName}>
                  {plan.name}
                </h3>
                <p className={classes.commercialPriceVisible}>{plan.priceLabel}</p>
                <p className={classes.commercialBillingNote}>{plan.billingNote}</p>
              </div>

              <div className={classes.commercialPlanRight}>
                <ul className={classes.commercialFeatureList}>
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <p className={classes.commercialDisclaimer}>{plan.disclaimer}</p>
              </div>
            </div>

            <div className={classes.commercialPlanActions}>
              <a
                className={shared.btnPrimary}
                href="#solicitar-demo"
                onClick={() => trackMarketingEvent("cta_demo_click", { location: "commercial_plan" })}
              >
                Solicitar propuesta comercial
              </a>
            <a
              className={shared.btnGhost}
              href={plan.learnMoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackMarketingEvent("cta_how_it_works_click", { location: "commercial_plan_learn_more" })}
            >
              {plan.learnMoreLabel}
            </a>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}