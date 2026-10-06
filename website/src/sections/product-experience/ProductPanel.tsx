import {
  AUTOMATE_STEPS,
  PLAN_TEAM,
  PRODUCT_SERVICES,
  RESOLVE_ALTERNATIVES,
  type ProductExperiencePhaseIndex,
} from "./experience-data";
import styles from "./product-experience.module.css";

type ProductPanelProps = {
  phase: ProductExperiencePhaseIndex;
};

function rowStatus(index: number, phase: ProductExperiencePhaseIndex): string {
  if (phase === 0) {
    return "Cubierto";
  }
  if (index === 0) {
    if (phase === 1) {
      return "Atención";
    }
    if (phase === 2) {
      return "Alternativas";
    }
    if (phase === 3) {
      return "En curso";
    }
    return "Cubierto";
  }
  if (phase >= 4) {
    if (index === 1) {
      return "Atención";
    }
    if (index === 2) {
      return "Pendiente";
    }
  }
  return "Cubierto";
}

function rowTone(index: number, phase: ProductExperiencePhaseIndex): "ok" | "warn" | "pending" {
  const status = rowStatus(index, phase);
  if (status === "Atención" || status === "Alternativas" || status === "En curso") {
    return "warn";
  }
  if (status === "Pendiente") {
    return "pending";
  }
  return "ok";
}

export function ProductPanel({ phase }: ProductPanelProps) {
  return (
    <div className={styles.panel} id="product-experience-panel" data-phase={phase} data-testid="product-experience-panel">
      <div className={styles.panelHeader}>
        <span>Operación de hoy</span>
        <span className={styles.panelLive}>En vivo</span>
      </div>
      <div className={styles.panelCanvas}>
        <div className={styles.serviceTable}>
          {PRODUCT_SERVICES.map((service, index) => (
            <div
              key={service.name}
              className={styles.serviceRow}
              data-tone={rowTone(index, phase)}
              data-focus={index === 0 && phase < 4 ? "true" : "false"}
            >
              <span className={styles.serviceName}>{service.name}</span>
              <span className={styles.serviceClient}>{service.client}</span>
              <span className={styles.serviceStatus}>{rowStatus(index, phase)}</span>
            </div>
          ))}
        </div>

        <div className={styles.phaseLayer} data-layer="plan" data-active={phase === 0 ? "true" : "false"}>
          <p className={styles.layerTitle}>Oficina Central · 08:00–16:00</p>
          <ul className={styles.teamList}>
            {PLAN_TEAM.map((person) => (
              <li key={person}>{person}</li>
            ))}
          </ul>
          <p className={styles.coverage}>Cobertura 5/5</p>
        </div>

        <div className={styles.phaseLayer} data-layer="detect" data-active={phase === 1 ? "true" : "false"}>
          <p className={styles.alertLine}>Juan no confirmó</p>
          <p className={styles.coverageWarn}>Cobertura 4/5</p>
        </div>

        <div className={styles.phaseLayer} data-layer="resolve" data-active={phase === 2 ? "true" : "false"}>
          <p className={styles.layerTitle}>3 alternativas</p>
          <ul className={styles.altList}>
            {RESOLVE_ALTERNATIVES.map((alt) => (
              <li key={alt.name}>
                <strong>{alt.name}</strong>
                <span>{alt.detail}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.phaseLayer} data-layer="automate" data-active={phase === 3 ? "true" : "false"}>
          <ul className={styles.checkList}>
            {AUTOMATE_STEPS.map((step) => (
              <li key={step}>✓ {step}</li>
            ))}
          </ul>
        </div>

        <div className={styles.phaseLayer} data-layer="control" data-active={phase === 4 ? "true" : "false"}>
          <div className={styles.controlStats}>
            <span>18 servicios</span>
            <span data-tone="ok">15 cubiertos</span>
            <span data-tone="warn">2 atención</span>
            <span data-tone="pending">1 pendiente</span>
          </div>
        </div>
      </div>
    </div>
  );
}
