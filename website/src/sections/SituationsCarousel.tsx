import { useState } from "react";
import { SITUATIONS } from "../content/landing-content";
import shared from "../styles/landing-shared.module.css";
import { SituationMicroDemo } from "./SituationMicroDemo";
import classes from "./sections.module.css";

export function SituationsCarousel() {
  const [index, setIndex] = useState(0);

  const go = (direction: -1 | 1) => {
    setIndex((prev) => {
      const next = prev + direction;
      if (next < 0) {
        return SITUATIONS.length - 1;
      }
      if (next >= SITUATIONS.length) {
        return 0;
      }
      return next;
    });
  };

  return (
    <section
      id="situaciones"
      className={`${shared.section} ${classes.situationsSection} ${shared.centered}`}
      aria-labelledby="situations-title"
    >
      <div className={shared.sectionInner}>
        <p className={classes.situationsEyebrow}>¿Qué pasa si…?</p>
        <h2 id="situations-title" className={shared.title}>
          Situaciones reales
        </h2>
        <div className={classes.carousel}>
          <div className={classes.carouselViewport} aria-live="polite" aria-atomic="true">
            {SITUATIONS.map((item, slideIndex) => (
              <article
                key={item.id}
                id={`situation-${item.id}`}
                className={classes.carouselSlide}
                hidden={slideIndex !== index}
                data-active={slideIndex === index ? "true" : "false"}
              >
                <h3>{item.title}</h3>
                <p>{item.line}</p>
                <SituationMicroDemo demoId={item.id} />
              </article>
            ))}
          </div>
          <div className={classes.carouselNav}>
            <button type="button" className={classes.carouselBtn} aria-label="Anterior" onClick={() => go(-1)}>
              ‹
            </button>
            <div className={classes.carouselDots} role="group" aria-label="Elegir situación">
              {SITUATIONS.map((item, dotIndex) => (
                <button
                  key={item.id}
                  type="button"
                  className={classes.dot}
                  aria-current={dotIndex === index ? "true" : undefined}
                  aria-label={item.title}
                  data-active={dotIndex === index}
                  onClick={() => setIndex(dotIndex)}
                />
              ))}
            </div>
            <button type="button" className={classes.carouselBtn} aria-label="Siguiente" onClick={() => go(1)}>
              ›
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
