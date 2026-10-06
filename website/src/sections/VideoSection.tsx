import { RevealOnView } from "../components/RevealOnView";
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
        <h2 id="video-title" className={shared.title}>
          Mirá Dinamic en acción.
        </h2>
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
      </div>
    </RevealOnView>
  );
}
