import { trackMarketingEvent } from "../analytics/marketing-events";
import { getOperationsLoginUrl } from "../config/operations-app-url";
import classes from "../sections/sections.module.css";

export function MarketingFooter() {
  const loginUrl = getOperationsLoginUrl();

  return (
    <footer className={classes.footer}>
      <div className={classes.footerInner}>
        <span>© {new Date().getFullYear()} Dinamic Operations</span>
        <nav className={classes.footerNav} aria-label="Enlaces del sitio">
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#situaciones">Situaciones</a>
          <a href={loginUrl}>Ingresar</a>
          <a
            href="#solicitar-demo"
            onClick={() => trackMarketingEvent("cta_demo_click", { location: "footer" })}
          >
            Solicitar una demo
          </a>
        </nav>
      </div>
    </footer>
  );
}
