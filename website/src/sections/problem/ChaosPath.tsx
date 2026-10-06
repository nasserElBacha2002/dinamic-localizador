import classes from "../sections.module.css";

type ChaosPathProps = {
  pathD: string;
  variant: "desktop" | "mobile";
  animate: boolean;
};

export function ChaosPath({ pathD, variant, animate }: ChaosPathProps) {
  const viewBox = variant === "desktop" ? "0 0 800 420" : "0 0 100 100";
  const preserve = variant === "desktop" ? "none" : "xMidYMid meet";

  return (
    <svg
      className={variant === "desktop" ? classes.chaosPathDesktop : classes.chaosPathMobile}
      viewBox={viewBox}
      preserveAspectRatio={preserve}
      aria-hidden="true"
    >
      <path
        d={pathD}
        className={classes.chaosPathStroke}
        data-animate={animate ? "true" : "false"}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
