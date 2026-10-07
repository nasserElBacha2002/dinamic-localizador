import {
  BRAND_ISOTIPO_SRC,
  BRAND_LOGO_HORIZONTAL_SRC,
  BRAND_PRODUCT_NAME,
  BRAND_REVERSO_SRC,
} from "../../brand/brand-assets";
import classes from "./brand-logo.module.css";

export type BrandLogoVariant = "horizontal" | "horizontalCompact" | "isotype" | "isotypeCompact" | "reverso";

type BrandLogoProps = {
  className?: string;
  variant?: BrandLogoVariant;
};

export function BrandLogo({ className, variant = "horizontal" }: BrandLogoProps) {
  const rootClass = [classes.root, className].filter(Boolean).join(" ");

  if (variant === "isotype" || variant === "isotypeCompact") {
    return (
      <span className={rootClass} aria-label={BRAND_PRODUCT_NAME}>
        <img
          className={
            variant === "isotypeCompact"
              ? `${classes.isotype} ${classes.isotypeCompact}`
              : classes.isotype
          }
          src={BRAND_ISOTIPO_SRC}
          alt=""
          width={40}
          height={40}
          decoding="async"
        />
      </span>
    );
  }

  if (variant === "reverso") {
    return (
      <span className={rootClass} aria-label={BRAND_PRODUCT_NAME}>
        <img
          className={classes.reverso}
          src={BRAND_REVERSO_SRC}
          alt=""
          width={52}
          height={52}
          decoding="async"
        />
      </span>
    );
  }

  const horizontalClass =
    variant === "horizontalCompact"
      ? `${classes.horizontal} ${classes.horizontalCompact}`
      : classes.horizontal;

  return (
    <span className={rootClass} aria-label={BRAND_PRODUCT_NAME}>
      <img
        className={horizontalClass}
        src={BRAND_LOGO_HORIZONTAL_SRC}
        alt=""
        width={240}
        height={72}
        decoding="async"
      />
    </span>
  );
}
