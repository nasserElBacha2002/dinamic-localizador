import classes from "./sections.module.css";

const TEAM = ["María", "Lucas", "Carla", "Juan", "Diego"] as const;

type SituationMicroDemoProps = {
  demoId: string;
  animate?: boolean;
};

export function SituationMicroDemo({ demoId, animate = false }: SituationMicroDemoProps) {
  switch (demoId) {
    case "missing-person":
      return (
        <div
          className={classes.situationMiniPanel}
          data-demo="missing-person"
          data-animate={animate ? "true" : "false"}
          aria-hidden="true"
        >
          <p className={classes.situationSignal}>Servicio incompleto</p>
          <div className={classes.situationServiceMeta}>
            <span>Oficina Central</span>
            <span data-tone="warn">⚠ Requiere atención</span>
          </div>
          <p className={classes.situationArrow}>↓</p>
          <p className={classes.situationOutcomeLead}>3 alternativas disponibles</p>
          <ul className={classes.situationAltList}>
            <li data-highlight="true">
              <span>María Gómez</span>
              <span>8 min</span>
            </li>
            <li>
              <span>Carlos López</span>
              <span>Experiencia previa</span>
            </li>
            <li>
              <span>Sofía Pérez</span>
              <span>Disponible</span>
            </li>
          </ul>
        </div>
      );
    case "tomorrow-team":
      return (
        <div
          className={classes.situationMiniPanel}
          data-demo="tomorrow-team"
          data-animate={animate ? "true" : "false"}
          aria-hidden="true"
        >
          <p className={classes.situationSignal}>Equipo de mañana</p>
          <p className={classes.situationMiniMeta}>Oficina Central · 08:00–16:00</p>
          <ul className={classes.situationTeamChips}>
            {TEAM.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
          <p className={classes.situationOutcomeLead}>Cobertura 5/5 ✓</p>
          <p className={classes.situationMiniMeta}>Plan armado para comenzar el día</p>
        </div>
      );
    case "services-started":
      return (
        <div
          className={classes.situationMiniPanel}
          data-demo="services-started"
          data-animate={animate ? "true" : "false"}
          aria-hidden="true"
        >
          <p className={classes.situationSignal}>Estado por servicio</p>
          <ul className={classes.situationStatusList}>
            <li data-state="ok">
              <span>Planta Norte</span>
              <span data-tone="ok">✓ Cubierto</span>
            </li>
            <li data-state="ok">
              <span>Hospital</span>
              <span data-tone="ok">✓ Cubierto</span>
            </li>
            <li data-state="pending" data-pulse="true">
              <span>Oficina Central</span>
              <span data-tone="warn">● Pendiente</span>
            </li>
          </ul>
        </div>
      );
    case "move-person":
      return (
        <div
          className={classes.situationMiniPanel}
          data-demo="move-person"
          data-animate={animate ? "true" : "false"}
          aria-hidden="true"
        >
          <p className={classes.situationSignal} data-tone="warn">Ausencia detectada</p>
          <p className={classes.situationArrow}>↓</p>
          <p className={classes.situationOutcomeLead}>2 reemplazos recomendados</p>
          <ul className={classes.situationAltList}>
            <li data-highlight="true">
              <span>Carlos López</span>
              <span>Disponible</span>
            </li>
            <li>
              <span>Sofía Pérez</span>
              <span>8 min</span>
            </li>
          </ul>
          <p className={classes.situationResolution}>
            ✓ Cobertura posible
            <span>Sin afectar otro servicio</span>
          </p>
        </div>
      );
    default:
      return null;
  }
}
