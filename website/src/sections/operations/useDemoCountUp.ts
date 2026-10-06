import { useEffect, useState } from "react";

export function useDemoCountUp(
  target: number,
  active: boolean,
  reducedMotion: boolean,
  durationMs = 900,
): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (reducedMotion || !active) {
      return;
    }

    const start = performance.now();
    let frame = 0;

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(target * progress));
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      }
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [active, durationMs, reducedMotion, target]);

  if (reducedMotion) {
    return target;
  }

  if (!active) {
    return 0;
  }

  return value;
}
