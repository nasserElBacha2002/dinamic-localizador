import { useCallback, useEffect, useState } from "react";
import { MobileSlideCarousel } from "../components/MobileSlideCarousel";
import { SectionCtaBand } from "../components/SectionCtaBand";
import { LANDING_MOBILE_MEDIA_QUERY } from "../constants/responsive";
import { SITUATIONS, SITUATIONS_SUPPORTING_TEXT } from "../content/landing-content";
import { useInView } from "../hooks/useInView";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import shared from "../styles/landing-shared.module.css";
import { SituationMicroDemo } from "./SituationMicroDemo";
import classes from "./sections.module.css";

const SPOTLIGHT_MS = 2800;

export function SituationsCarousel() {
  const reducedMotion = usePrefersReducedMotion();
  const isMobile = useMediaQuery(LANDING_MOBILE_MEDIA_QUERY);
  const { ref, inView } = useInView<HTMLElement>({ threshold: 0.2, once: false });
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mobileSlide, setMobileSlide] = useState(0);

  const cycleSpotlight = inView && !reducedMotion && !isMobile;

  useEffect(() => {
    if (!cycleSpotlight) {
      return;
    }

    const interval = window.setInterval(() => {
      setSpotlightIndex((current) => (current + 1) % SITUATIONS.length);
    }, SPOTLIGHT_MS);

    return () => window.clearInterval(interval);
  }, [cycleSpotlight]);

  const renderCard = useCallback(
    (item: (typeof SITUATIONS)[number], index: number) => {
      const isSpotlight =
        !reducedMotion &&
        !isMobile &&
        (hoveredId === item.id || (hoveredId === null && spotlightIndex === index));
      const shouldAnimate =
        inView && !reducedMotion && (!isMobile || mobileSlide === index);

      return (
        <article
          key={item.id}
          id={`situation-${item.id}`}
          className={classes.situationFeatureCard}
          data-spotlight={isSpotlight ? "true" : "false"}
          onMouseEnter={() => setHoveredId(item.id)}
          onMouseLeave={() => setHoveredId(null)}
        >
          <div className={classes.situationCardVisual}>
            <SituationMicroDemo demoId={item.id} animate={shouldAnimate} />
          </div>
          <div className={classes.situationCardBody}>
            <h3>{item.title}</h3>
            <p>{item.line}</p>
          </div>
        </article>
      );
    },
    [hoveredId, inView, isMobile, mobileSlide, reducedMotion, spotlightIndex],
  );

  return (
    <section
      ref={ref}
      id="situaciones"
      className={`${shared.section} ${classes.situationsSection}`}
      aria-labelledby="situations-title"
      data-spotlight-active={cycleSpotlight ? "true" : "false"}
      data-in-view={inView ? "true" : "false"}
      data-reduced={reducedMotion ? "true" : "false"}
      data-mobile-layout={isMobile ? "carousel" : "grid"}
    >
      <div className={shared.sectionInner}>
        <header className={classes.situationsBridge}>
          <p className={classes.situationsBridgeLead}>¿Y cuando algo cambia?</p>
          <h2 id="situations-title" className={`${shared.title} ${classes.situationsTitle}`}>
            Situaciones reales
          </h2>
          <p className={classes.situationsIntro}>{SITUATIONS_SUPPORTING_TEXT}</p>
        </header>

        {!isMobile ? (
          <div className={classes.situationCardsGrid}>
            {SITUATIONS.map((item, index) => renderCard(item, index))}
          </div>
        ) : null}

        {isMobile ? (
          <MobileSlideCarousel
            ariaLabel="Situaciones reales"
            activeIndex={mobileSlide}
            onActiveIndexChange={setMobileSlide}
            slideCount={SITUATIONS.length}
            testId="situations-mobile-carousel"
          >
            {SITUATIONS.map((item, index) => renderCard(item, index))}
          </MobileSlideCarousel>
        ) : null}

        <SectionCtaBand
          testId="cta-post-situations"
          title="¿Estas situaciones también pasan en tu operación?"
          description="Te mostramos cómo detectarlas antes y resolverlas desde un solo lugar."
          primary={{
            label: "Solicitar una demo",
            href: "#solicitar-demo",
            trackLocation: "situations",
          }}
          secondary={{
            label: "Ver cómo funciona",
            href: "#como-funciona",
            trackLocation: "situations",
            trackEvent: "how_it_works",
          }}
        />
      </div>
    </section>
  );
}
