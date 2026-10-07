import { BrandLogo } from "./BrandLogo";
import classes from "./auth-page-logo.module.css";

type AuthPageLogoProps = {
  /** Light lockup for the dark brand aside on desktop. */
  onDark?: boolean;
};

export function AuthPageLogo({ onDark = false }: AuthPageLogoProps) {
  return (
    <div className={classes.root}>
      <BrandLogo variant={onDark ? "reverso" : "horizontal"} />
    </div>
  );
}
