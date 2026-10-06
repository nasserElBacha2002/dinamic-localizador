import { getOperationsLoginUrl } from "../config/operations-app-url";
import classes from "../sections/sections.module.css";

export function MarketingFooter() {
  return (
    <footer className={classes.footer}>
      <div className={classes.footerInner}>
        <span>© {new Date().getFullYear()} Dinamic Operations</span>
        <a href={getOperationsLoginUrl()}>Acceso clientes</a>
      </div>
    </footer>
  );
}
