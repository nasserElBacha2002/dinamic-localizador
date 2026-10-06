import { useCallback, useRef, type ReactNode, type TouchEvent } from "react";
import classes from "./mobile-slide-carousel.module.css";

const SWIPE_THRESHOLD_PX = 48;

type MobileSlideCarouselProps = {
  ariaLabel: string;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  slideCount: number;
  testId?: string;
  children: ReactNode[];
};

export function MobileSlideCarousel({
  ariaLabel,
  activeIndex,
  onActiveIndexChange,
  slideCount,
  testId,
  children,
}: MobileSlideCarouselProps) {
  const touchStartX = useRef<number | null>(null);

  const goPrev = useCallback(() => {
    onActiveIndexChange(Math.max(0, activeIndex - 1));
  }, [activeIndex, onActiveIndexChange]);

  const goNext = useCallback(() => {
    onActiveIndexChange(Math.min(slideCount - 1, activeIndex + 1));
  }, [activeIndex, onActiveIndexChange, slideCount]);

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  };

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start === null) {
      return;
    }
    const end = event.changedTouches[0]?.clientX ?? start;
    const delta = end - start;
    if (delta > SWIPE_THRESHOLD_PX) {
      goPrev();
    } else if (delta < -SWIPE_THRESHOLD_PX) {
      goNext();
    }
  };

  return (
    <div
      className={classes.mobileCarousel}
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      data-testid={testId}
    >
      <div
        className={classes.mobileCarouselViewport}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {children.map((slide, index) => (
          <div
            key={index}
            className={classes.mobileCarouselSlide}
            hidden={index !== activeIndex}
            aria-hidden={index !== activeIndex}
          >
            {slide}
          </div>
        ))}
      </div>

      <div className={classes.mobileCarouselNav}>
        <button
          type="button"
          className={classes.mobileCarouselBtn}
          aria-label="Anterior"
          onClick={goPrev}
          disabled={activeIndex === 0}
        >
          ‹
        </button>
        <span className={classes.mobileCarouselCounter} aria-hidden="true">
          {activeIndex + 1}/{slideCount}
        </span>
        <div className={classes.mobileCarouselDots} role="tablist" aria-label="Slides">
          {Array.from({ length: slideCount }, (_, index) => (
            <button
              key={index}
              type="button"
              role="tab"
              className={classes.mobileCarouselDot}
              aria-label={`Ir a slide ${index + 1}`}
              aria-selected={index === activeIndex}
              data-active={index === activeIndex ? "true" : "false"}
              onClick={() => onActiveIndexChange(index)}
            />
          ))}
        </div>
        <button
          type="button"
          className={classes.mobileCarouselBtn}
          aria-label="Siguiente"
          onClick={goNext}
          disabled={activeIndex >= slideCount - 1}
        >
          ›
        </button>
      </div>
    </div>
  );
}
