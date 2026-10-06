import { trackMarketingEvent } from "../analytics/marketing-events";
import shared from "../styles/landing-shared.module.css";
import classes from "./section-cta-band.module.css";

type CtaLink = {
  label: string;
  href: string;
  trackLocation: string;
  trackEvent?: "demo" | "how_it_works";
};

type SectionCtaBandProps = {
  title: string;
  description?: string;
  primary?: CtaLink;
  secondary?: CtaLink;
  tone?: "light" | "dark";
  testId?: string;
};

function trackCta(link: CtaLink) {
  if (link.trackEvent === "how_it_works") {
    trackMarketingEvent("cta_how_it_works_click", { location: link.trackLocation });
    return;
  }
  trackMarketingEvent("cta_demo_click", { location: link.trackLocation });
}

export function SectionCtaBand({
  title,
  description,
  primary,
  secondary,
  tone = "light",
  testId,
}: SectionCtaBandProps) {
  const ghostClass = tone === "dark" ? classes.sectionCtaGhostOnDark : "";

  return (
    <aside
      className={`${classes.sectionCtaBand} ${tone === "dark" ? classes.sectionCtaBandDark : ""}`}
      data-testid={testId}
      aria-label={title}
    >
      <h3 className={classes.sectionCtaTitle}>{title}</h3>
      {description ? <p className={classes.sectionCtaDescription}>{description}</p> : null}
      {primary || secondary ? (
        <div className={classes.sectionCtaActions}>
          {primary ? (
            <a className={shared.btnPrimary} href={primary.href} onClick={() => trackCta(primary)}>
              {primary.label}
            </a>
          ) : null}
          {secondary ? (
            <a
              className={`${shared.btnGhost} ${ghostClass}`}
              href={secondary.href}
              onClick={() => trackCta(secondary)}
            >
              {secondary.label}
            </a>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
