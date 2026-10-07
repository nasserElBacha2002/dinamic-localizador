import { BRAND_LOGO_HORIZONTAL_SRC, BRAND_PRODUCT_NAME } from "../brand/brand-assets";
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
      <span className={className} aria-label={BRAND_PRODUCT_NAME}>
        <DinamicIsotype className={classes.isotypeLg} title={BRAND_PRODUCT_NAME} />
      </span>
    );
  }

  if (variant === "reverse") {
    return (
      <span className={className} aria-label={BRAND_PRODUCT_NAME}>
        <DinamicIsotype className={classes.reversoMark} variant="reverse" title={BRAND_PRODUCT_NAME} />
      </span>
    );
  }

  return (
    <span className={`${classes.root} ${className ?? ""}`} aria-label={BRAND_PRODUCT_NAME}>
      <img
        className={classes.horizontalLockup}
        src={BRAND_LOGO_HORIZONTAL_SRC}
        alt=""
        width={480}
        height={150}
        decoding="async"
      />
    </span>
  );
}
