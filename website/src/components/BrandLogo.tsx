import { BRAND_LOGO_HORIZONTAL_SRC } from "../brand/brand-assets";
import { DinamicIsotype } from "../brand/DinamicIsotype";
import classes from "./brand-logo.module.css";

type BrandLogoVariant = "horizontal" | "isotype" | "reverse";

type BrandLogoProps = {
  className?: string;
  variant?: BrandLogoVariant;
};

export function BrandLogo({ className, variant = "horizontal" }: BrandLogoProps) {
  if (variant === "isotype") {
    return (
      <span className={className} aria-label="Dinamic Operations">
        <DinamicIsotype className={classes.isotypeLg} title="Dinamic Operations" />
      </span>
    );
  }

  if (variant === "reverse") {
    return (
      <span className={className} aria-label="Dinamic Operations">
        <DinamicIsotype className={classes.reversoMark} variant="reverse" title="Dinamic Operations" />
      </span>
    );
  }

  return (
    <span className={`${classes.root} ${className ?? ""}`} aria-label="Dinamic Operations">
      <img
        className={classes.horizontalLockup}
        src={BRAND_LOGO_HORIZONTAL_SRC}
        alt=""
        width={760}
        height={220}
        decoding="async"
      />
    </span>
  );
}
