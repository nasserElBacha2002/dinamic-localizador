import { DemoRequestForm } from "../components/DemoRequestForm";
import shared from "../styles/landing-shared.module.css";
import classes from "./sections.module.css";

export function DemoSection() {
  return (
    <section id="solicitar-demo" className={`${shared.section} ${classes.demoSection}`} aria-labelledby="demo-title">
      <div className={shared.sectionInner}>
        <h2 id="demo-title" className={`${shared.title} ${shared.centered}`}>
          Solicitá una demo
        </h2>
        <p className={`${shared.lead} ${shared.centered}`}>
          Contanos sobre tu operación. Te mostramos cómo planificar, detectar y resolver en Dinamic Operations.
        </p>
        <div className={classes.demoCard}>
          <DemoRequestForm />
        </div>
      </div>
    </section>
  );
}
