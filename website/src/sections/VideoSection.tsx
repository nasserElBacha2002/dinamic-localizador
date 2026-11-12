import { useCallback, useEffect, useRef, useState } from "react";
import { RevealOnView } from "../components/RevealOnView";
import { SectionCtaBand } from "../components/SectionCtaBand";
import { PRODUCT_VIDEO } from "../content/landing-content";
import shared from "../styles/landing-shared.module.css";
import classes from "./sections.module.css";

export function VideoSection() {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const frame = frameRef.current;
    const el = videoRef.current;
    if (!frame || !el) return;

    const tryPlay = () => {
      if (!el.paused) {
        setNeedsTap(false);
        return;
      }
      el.muted = true;
      void el.play()
        .then(() => setNeedsTap(false))
        .catch(() => setNeedsTap(true));
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) tryPlay();
        else el.pause();
      },
      { threshold: 0.35 },
    );
    const onPlaying = () => setNeedsTap(false);
    el.addEventListener("playing", onPlaying);
    io.observe(frame);

    return () => {
      io.disconnect();
      el.removeEventListener("playing", onPlaying);
    };
  }, []);

  const play = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    void el.play().then(() => setNeedsTap(false)).catch(() => undefined);
  }, []);

  const unmute = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = false;
    setMuted(false);
    void el.play().catch(() => undefined);
  }, []);

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
        <div ref={frameRef} className={classes.videoFrame} role="group" aria-label={PRODUCT_VIDEO.title}>
          <video
            ref={videoRef}
            className={classes.videoElement}
            src={PRODUCT_VIDEO.src}
            width={PRODUCT_VIDEO.width}
            height={PRODUCT_VIDEO.height}
            preload="auto"
            playsInline
            autoPlay
            muted
            loop
            controls={!muted}
            data-testid="product-video"
            aria-label={PRODUCT_VIDEO.title}
          />
          {needsTap ? (
            <div className={classes.videoOverlay}>
              <button type="button" className={classes.videoPlay} aria-label="Reproducir video demostrativo" onClick={play}>
                ▶
              </button>
            </div>
          ) : null}
          {muted && !needsTap ? (
            <button type="button" className={classes.videoUnmute} onClick={unmute} aria-label="Activar sonido del video">
              Activar sonido
            </button>
          ) : null}
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
