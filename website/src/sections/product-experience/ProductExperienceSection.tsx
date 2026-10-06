import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import shared from "../../styles/landing-shared.module.css";
import {
  PRODUCT_EXPERIENCE_PHASES,
  type ProductExperiencePhaseIndex,
} from "./experience-data";
import { ProductPanel } from "./ProductPanel";
import styles from "./product-experience.module.css";

export function ProductExperienceSection() {
  const reducedMotion = usePrefersReducedMotion();
  const [phase, setPhase] = useState<ProductExperiencePhaseIndex>(0);
  const copy = PRODUCT_EXPERIENCE_PHASES[phase] ?? PRODUCT_EXPERIENCE_PHASES[0];

  const go = useCallback((direction: -1 | 1) => {
    setPhase((prev) => {
      const next = prev + direction;
      if (next < 0) {
        return 4 as ProductExperiencePhaseIndex;
      }
      if (next > 4) {
        return 0;
      }
      return next as ProductExperiencePhaseIndex;
    });
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      return;
    }
    const timer = window.setInterval(() => go(1), 6000);
    return () => window.clearInterval(timer);
  }, [go, reducedMotion]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    }
  };

  return (
    <section
      id="producto"
      className={`${shared.section} ${styles.section}`}
      aria-labelledby="product-experience-title"
    >
      <div className={shared.sectionInner}>
        <h2 id="product-experience-title" className={`${shared.title} ${shared.centered}`}>
          Planificá · Detectá · Resolvé
        </h2>
        <div
          className={styles.experience}
          data-testid="product-experience"
          data-phase={phase}
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          <div className={styles.tabs} role="tablist" aria-label="Etapas del producto">
            {PRODUCT_EXPERIENCE_PHASES.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                className={styles.tab}
                aria-selected={phase === index ? "true" : "false"}
                aria-controls="product-experience-panel"
                data-active={phase === index ? "true" : "false"}
                onClick={() => setPhase(index as ProductExperiencePhaseIndex)}
              >
                {item.title}
              </button>
            ))}
          </div>
          <div className={styles.copyBlock} aria-live="off">
            <p className={styles.phaseLabel} data-testid="product-experience-phase-label">
              {copy.title}
            </p>
            {copy.lines.map((line) => (
              <p key={line} className={styles.phaseLine}>
                {line}
              </p>
            ))}
          </div>
          <ProductPanel phase={phase} />
          <div className={styles.nav}>
            <button type="button" className={styles.navBtn} aria-label="Fase anterior del producto" onClick={() => go(-1)}>
              ‹
            </button>
            <span>
              {phase + 1} / {PRODUCT_EXPERIENCE_PHASES.length}
            </span>
            <button type="button" className={styles.navBtn} aria-label="Fase siguiente del producto" onClick={() => go(1)}>
              ›
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
