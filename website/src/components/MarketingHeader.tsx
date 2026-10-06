import { trackMarketingEvent } from "../analytics/marketing-events";
import { getOperationsLoginUrl } from "../config/operations-app-url";
import { BrandLogo } from "./BrandLogo";
import classes from "./marketing-header.module.css";
import shared from "../styles/landing-shared.module.css";

export function MarketingHeader() {
  const loginUrl = getOperationsLoginUrl();

  return (
    <header className={classes.header}>
      <div className={classes.inner}>
        <a href="/" className={classes.logoLink} aria-label="Inicio Dinamic Operations">
          <BrandLogo variant="horizontal" />
        </a>
        <nav className={classes.nav} aria-label="Secciones">
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#control">Control</a>
          <a href="#situaciones">Situaciones</a>
        </nav>
        <div className={classes.actions}>
          <a className={classes.loginLink} href={loginUrl}>
            Ingresar
          </a>
          <a
            className={shared.btnPrimary}
            href="#solicitar-demo"
            onClick={() => trackMarketingEvent("cta_demo_click", { location: "header" })}
          >
            Solicitar una demo
          </a>
        </div>
      </div>
    </header>
  );
}
