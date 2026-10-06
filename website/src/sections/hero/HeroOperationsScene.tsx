import { useEffect, useState } from "react";
import { useInView } from "../../hooks/useInView";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { ServiceGrid } from "./ServiceGrid";
import {
  HERO_SCENE_PHASE_MS,
  HERO_SCENE_PHASES,
  heroSceneAlertIndex,
  heroSceneReducedPhase,
  type HeroScenePhase,
} from "./scene-data";
import { StatusOverlay } from "./StatusOverlay";
import classes from "../sections.module.css";

export function HeroOperationsScene() {
  const reducedMotion = usePrefersReducedMotion();
  const isCompact = useMediaQuery("(max-width: 640px)");
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.15 });
  const serviceCount = isCompact ? 9 : 12;
  const alertIndex = heroSceneAlertIndex(serviceCount);

  const [phase, setPhase] = useState<HeroScenePhase>("normal");
  const displayPhase = reducedMotion ? heroSceneReducedPhase() : phase;

  const gridPhase = reducedMotion ? "error" : displayPhase;

  useEffect(() => {
    if (reducedMotion || !inView) {
      return;
    }
    const timer = window.setInterval(() => {
      setPhase((current) => {
        const currentIndex = HERO_SCENE_PHASES.indexOf(current);
        const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % HERO_SCENE_PHASES.length;
        return HERO_SCENE_PHASES[nextIndex] ?? "normal";
      });
    }, HERO_SCENE_PHASE_MS);
    return () => window.clearInterval(timer);
  }, [inView, reducedMotion]);

  return (
    <div
      ref={ref}
      className={classes.heroOperationsScene}
      data-testid="hero-visual"
      data-phase={displayPhase}
      data-reduced={reducedMotion ? "true" : "false"}
      data-paused={!inView && !reducedMotion ? "true" : "false"}
      aria-hidden="true"
    >
      <div className={classes.heroSceneHeader}>
        <span className={classes.heroSceneHeaderTitle}>Operación de hoy</span>
        <span className={classes.heroSceneHeaderMeta}>{serviceCount} servicios</span>
      </div>
      <div className={classes.heroSceneCanvas}>
        <ServiceGrid serviceCount={serviceCount} alertIndex={alertIndex} phase={gridPhase} />
        <svg className={classes.heroSceneConnector} viewBox="0 0 200 80" aria-hidden="true">
          <path d="M 100 12 L 100 48" stroke="var(--m-brand)" strokeWidth="2" strokeDasharray="4 3" fill="none" />
        </svg>
        <StatusOverlay phase={displayPhase} reducedMotion={reducedMotion} serviceCount={serviceCount} />
      </div>
    </div>
  );
}
