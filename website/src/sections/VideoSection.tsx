import { RevealOnView } from "../components/RevealOnView";
import { SectionCtaBand } from "../components/SectionCtaBand";
import shared from "../styles/landing-shared.module.css";
import classes from "./sections.module.css";

export function VideoSection() {
  return (
    <RevealOnView
      as="section"
      id="como-funciona"
      className={`${shared.section} ${classes.videoSection} ${shared.centered}`}
      aria-labelledby="video-title"
    >
      <div className={shared.sectionInner}>
        <h2 id="video-title" className={classes.videoSectionTitle}>
          <span>PLANIFICÁ</span>
          <span className={classes.videoSectionSep} aria-hidden="true"> · </span>
          <span>DETECTÁ</span>
          <span className={classes.videoSectionSep} aria-hidden="true"> · </span>
          <span>RESOLVÉ</span>
        </h2>
        <p className={classes.videoSectionLead}>
          Mirá cómo Dinamic Operations convierte lo que pasa en la operación en acciones concretas.
        </p>
        <div
          className={classes.videoFrame}
          role="group"
          aria-label="Video demostrativo próximamente"
        >
          <button type="button" className={classes.videoPlay} aria-label="Reproducir video demostrativo">
            ▶
          </button>
          <div className={classes.videoTimeline}>
            <span />
          </div>
        </div>
        <SectionCtaBand
          testId="cta-post-video"
          tone="dark"
          title="¿Querés verlo aplicado a tu operación?"
          description="Te mostramos cómo Dinamic Operations puede adaptarse a tus servicios, equipos y ubicaciones."
          primary={{
            label: "Solicitar una demo",
            href: "#solicitar-demo",
            trackLocation: "post_video",
          }}
          secondary={{
            label: "Ver situaciones reales",
            href: "#situaciones",
            trackLocation: "post_video",
            trackEvent: "how_it_works",
          }}
        />
      </div>
    </RevealOnView>
  );
}
