import { RevealOnView } from "../components/RevealOnView";
import shared from "../styles/landing-shared.module.css";
import classes from "./sections.module.css";

export function AudienceSection() {
  return (
    <RevealOnView as="section" className={`${shared.section} ${classes.audienceSection}`}>
      <div className={`${shared.sectionInner} ${classes.audienceInner}`}>
        <p className={classes.audienceEyebrow}>Para quién</p>
        <h2 className={classes.audienceTitle}>
          Hecho para operaciones
          <br />
          que no pasan en una sola oficina.
        </h2>
        <p className={classes.audienceTags}>
          Limpieza · Facility · Servicios tercerizados · Equipos distribuidos
        </p>
      </div>
    </RevealOnView>
  );
}
