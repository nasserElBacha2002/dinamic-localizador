import { DemoRequestForm } from "../components/DemoRequestForm";
import shared from "../styles/landing-shared.module.css";
import classes from "./sections.module.css";

const INDUSTRY_TAGS = [
  "Limpieza",
  "Facility",
  "Servicios tercerizados",
  "Equipos distribuidos",
] as const;

const VALUE_POINTS = [
  "Control por servicio",
  "Alertas y reemplazos",
  "Seguimiento en tiempo real",
] as const;

export function DemoSection() {
  return (
    <section id="solicitar-demo" className={`${shared.section} ${classes.demoSection}`} aria-labelledby="demo-title">
      <div className={shared.sectionInner}>
        <div className={classes.demoLayout}>
          <div className={classes.demoMessaging}>
            <p className={classes.demoBrandEyebrow}>Dinamic Operations</p>
            <h2 id="demo-title" className={classes.demoHeadline}>
              Menos tiempo coordinando.
              <br />
              Más servicios bajo control.
            </h2>
            <p className={classes.demoAudienceLine}>
              Hecho para operaciones que no pasan en una sola oficina.
            </p>
            <ul className={classes.demoIndustryTags}>
              {INDUSTRY_TAGS.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
            <ul className={classes.demoValueList}>
              {VALUE_POINTS.map((point) => (
                <li key={point}>✓ {point}</li>
              ))}
            </ul>
          </div>
          <div className={classes.demoFormColumn}>
            <p className={classes.demoFormEyebrow}>Solicitá una demo</p>
            <p className={classes.demoFormLead}>
              Contanos sobre tu operación. Te mostramos cómo planificar, detectar y resolver en Dinamic
              Operations.
            </p>
            <div className={classes.demoCard}>
              <DemoRequestForm />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
