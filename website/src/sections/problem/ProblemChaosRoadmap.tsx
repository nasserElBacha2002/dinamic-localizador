import { useState } from "react";
import { useInView } from "../../hooks/useInView";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { ChaosAlert } from "./ChaosAlert";
import { ChaosNode } from "./ChaosNode";
import { ChaosPath } from "./ChaosPath";
import {
  CHAOS_CONTROL_STATS,
  CHAOS_FLOATING_ALERTS,
  CHAOS_NODES,
  CHAOS_ROADMAP_PATH_DESKTOP,
  CHAOS_ROADMAP_PATH_MOBILE,
} from "./chaos-data";
import classes from "../sections.module.css";

export function ProblemChaosRoadmap() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.25 });
  const reducedMotion = usePrefersReducedMotion();
  const isMobileLayout = useMediaQuery("(max-width: 767px)");
  const animate = inView && !reducedMotion;
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const nodeLayout = isMobileLayout ? "mobile" : "desktop";

  return (
    <div
      ref={ref}
      className={classes.chaosRoadmap}
      data-testid="chaos-roadmap"
      data-animate={animate ? "true" : "false"}
      data-reduced={reducedMotion ? "true" : "false"}
      data-in-view={inView ? "true" : "false"}
      data-highlight={highlightId ?? undefined}
    >
      <p className={classes.chaosMicrocopy}>Chats. Llamadas. Planillas. Cambios de último momento.</p>
      <div className={classes.chaosRoadmapScene}>
        <div className={classes.chaosSceneGlow} aria-hidden="true" />
        <ChaosPath
          pathD={isMobileLayout ? CHAOS_ROADMAP_PATH_MOBILE : CHAOS_ROADMAP_PATH_DESKTOP}
          variant={isMobileLayout ? "mobile" : "desktop"}
          animate={animate}
        />
        <div className={classes.chaosFlashLayer} aria-hidden="true">
          {CHAOS_FLOATING_ALERTS.map((alert) => (
            <ChaosAlert key={alert.id} {...alert} animate={animate} />
          ))}
        </div>
        <div className={classes.chaosNodeLayer} aria-hidden="true">
          {CHAOS_NODES.map((node) => (
            <ChaosNode
              key={node.id}
              node={node}
              animate={animate}
              highlighted={highlightId === node.id}
              highlightId={highlightId}
              onHighlight={setHighlightId}
              layout={nodeLayout}
            />
          ))}
        </div>
        <div className={classes.chaosResolve} aria-hidden="true">
          <div className={classes.chaosCore}>
            <span className={classes.chaosCoreIcon} aria-hidden="true">
              ◆
            </span>
            Dinamic Operations
          </div>
          <div className={classes.chaosOrganized}>
            {CHAOS_CONTROL_STATS.map((stat) => (
              <span key={stat.label} data-tone={stat.tone}>
                {stat.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className={classes.chaosSrOnly}>
        Coordinación dispersa entre mensajes, llamadas y planillas converge en Dinamic Operations con servicios cubiertos,
        atención y pendientes visibles.
      </p>
    </div>
  );
}
