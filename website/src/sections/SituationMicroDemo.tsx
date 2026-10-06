import classes from "./sections.module.css";

type SituationMicroDemoProps = {
  demoId: string;
};

export function SituationMicroDemo({ demoId }: SituationMicroDemoProps) {
  switch (demoId) {
    case "missing-person":
      return (
        <div className={classes.microDemoSimple} aria-hidden="true">
          <p>⚠ Servicio incompleto</p>
          <p className={classes.microDemoArrow}>→</p>
          <p>3 alternativas disponibles</p>
        </div>
      );
    case "tomorrow-team":
      return (
        <div className={classes.microDemoSimple} aria-hidden="true">
          <p>Equipo de mañana</p>
          <p className={classes.microDemoArrow}>→</p>
          <p>Plan armado en un solo lugar</p>
        </div>
      );
    case "services-started":
      return (
        <div className={classes.microDemoSimple} aria-hidden="true">
          <p>¿Arrancaron todos?</p>
          <p className={classes.microDemoMarks}>✓ ✓ ✓ ⚠ ✓</p>
        </div>
      );
    case "move-person":
      return (
        <div className={classes.microDemoSimple} aria-hidden="true">
          <p>Persona reasignada</p>
          <p className={classes.microDemoArrow}>→</p>
          <p>Ambos servicios cubiertos</p>
        </div>
      );
    default:
      return null;
  }
}
