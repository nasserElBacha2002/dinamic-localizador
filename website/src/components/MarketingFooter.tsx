import { trackMarketingEvent } from "../analytics/marketing-events";
import { getOperationsLoginUrl } from "../config/operations-app-url";
import { PRIVACY_POLICY_SEO } from "../content/privacy-policy-content";
import classes from "../sections/sections.module.css";

type MarketingFooterProps = {
  marketingRoot?: string;
  demoHref?: string;
};

export function MarketingFooter({ marketingRoot = "", demoHref = "#solicitar-demo" }: MarketingFooterProps) {
  const loginUrl = getOperationsLoginUrl();
  const section = (hash: string) => `${marketingRoot}${hash}`;

  return (
    <footer className={classes.footer}>
      <div className={classes.footerInner}>
        <span>© {new Date().getFullYear()} Dinamic Operations</span>
        <nav className={classes.footerNav} aria-label="Enlaces del sitio">
          <a href={section("#como-funciona")}>Cómo funciona</a>
          <a href={section("#situaciones")}>Situaciones</a>
          <a href={loginUrl}>Ingresar</a>
          <a
            href={demoHref}
            onClick={() => trackMarketingEvent("cta_demo_click", { location: "footer" })}
          >
            Solicitar una demo
          </a>
          <a href={PRIVACY_POLICY_SEO.pathname}>Política de privacidad</a>
        </nav>
      </div>
    </footer>
  );
}
