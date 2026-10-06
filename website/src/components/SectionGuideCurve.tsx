import classes from "./section-guide-curve.module.css";

type SectionGuideCurveProps = {
  variant?: "hero" | "cta";
};

/** Línea naranja inspirada en la D abierta — no es logo definitivo. */
export function SectionGuideCurve({ variant = "hero" }: SectionGuideCurveProps) {
  return (
    <div className={classes.wrap} aria-hidden="true" data-variant={variant}>
      <svg className={classes.svg} viewBox="0 0 1440 80" preserveAspectRatio="none">
        <path
          d="M0,40 C360,80 720,0 1080,40 C1260,60 1380,50 1440,40 L1440,80 L0,80 Z"
          fill="var(--m-surface-muted)"
        />
        <path
          d="M120,20 C420,70 620,-10 920,35"
          fill="none"
          stroke="var(--m-brand)"
          strokeWidth="3"
          strokeLinecap="round"
          className={classes.stroke}
        />
      </svg>
    </div>
  );
}
