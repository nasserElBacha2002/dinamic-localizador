import classes from "../sections.module.css";

type ServiceGridProps = {
  serviceCount: number;
  alertIndex: number;
  phase: string;
};

export function ServiceGrid({ serviceCount, alertIndex, phase }: ServiceGridProps) {
  return (
    <div className={classes.heroSceneGrid} data-count={serviceCount}>
      {Array.from({ length: serviceCount }, (_, index) => {
        let tone: "ok" | "warn" | "processing" = "ok";
        if (index === alertIndex) {
          if (phase === "error") {
            tone = "warn";
          } else if (phase === "resolve") {
            tone = "processing";
          } else {
            tone = "ok";
          }
        }
        return (
          <span
            key={index}
            className={classes.heroSceneDot}
            data-tone={tone}
            data-alert={index === alertIndex ? "true" : "false"}
          />
        );
      })}
    </div>
  );
}
