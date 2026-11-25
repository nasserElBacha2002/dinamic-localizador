import { trackMarketingEvent } from "../analytics/marketing-events";
import { getOperationsLoginUrl } from "../config/operations-app-url";
import { BrandLogo } from "./BrandLogo";
import classes from "./marketing-header.module.css";
import shared from "../styles/landing-shared.module.css";

type MarketingHeaderProps = {
  /** Prefijo para anclas de secciones (p. ej. "/" en landings secundarias). */
  marketingRoot?: string;
  demoHref?: string;
};

export function MarketingHeader({ marketingRoot = "", demoHref = "#solicitar-demo" }: MarketingHeaderProps) {
  const loginUrl = getOperationsLoginUrl();
  const section = (hash: string) => `${marketingRoot}${hash}`;

  return (
    <header className={classes.header}>
      <div className={classes.inner}>
        <a href="/" className={classes.logoLink} aria-label="Inicio Dinamic Operations">
          <BrandLogo variant="horizontal" className={classes.logoDesktop} />
          <BrandLogo variant="isotype" className={classes.logoMobile} />
        </a>
        <nav className={classes.nav} aria-label="Secciones">
          <a href={section("#como-funciona")}>Cómo funciona</a>
          <a href={section("#control")}>Control</a>
          <a href={section("#situaciones")}>Situaciones</a>
        </nav>
        <div className={classes.actions}>
          <a className={classes.loginLink} href={loginUrl}>
            Ingresar
          </a>
          <a
            className={shared.btnPrimary}
            href={demoHref}
            onClick={() => trackMarketingEvent("cta_demo_click", { location: "header" })}
          >
            Solicitar una demo
          </a>
        </div>
      </div>
    </header>
  );
}
