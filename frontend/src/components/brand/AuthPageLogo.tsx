import { BrandLogo } from "./BrandLogo";
import classes from "./auth-page-logo.module.css";

type AuthPageLogoProps = {
  /** Reverso sobre el panel de marca oscuro (desktop). */
  onDark?: boolean;
};

export function AuthPageLogo({ onDark = false }: AuthPageLogoProps) {
  return (
    <div className={onDark ? `${classes.root} ${classes.rootReverso}` : `${classes.root} ${classes.rootHorizontal}`}>
      <BrandLogo variant={onDark ? "reverso" : "horizontal"} />
    </div>
  );
}
