import { useEffect, useRef, useState } from "react";

/** Fase activa según el sentinel más avanzado visible (scroll story sin scroll-jacking). */
export function useSentinelPhase(phaseCount: number, enabled = true) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!enabled || phaseCount <= 1) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      return;
    }
    const root = trackRef.current;
    if (!root) {
      return;
    }
    const sentinels = root.querySelectorAll<HTMLElement>("[data-sentinel-index]");
    if (!sentinels.length) {
      return;
    }

    const visible = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number(entry.target.getAttribute("data-sentinel-index"));
          if (Number.isNaN(index)) {
            continue;
          }
          if (entry.isIntersecting) {
            visible.add(index);
          } else {
            visible.delete(index);
          }
        }
        const max = visible.size ? Math.max(...visible) : 0;
        setPhase(max);
      },
      { root: null, threshold: 0.45, rootMargin: "-20% 0px -35% 0px" },
    );

    sentinels.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [enabled, phaseCount]);

  return { trackRef, phase };
}
