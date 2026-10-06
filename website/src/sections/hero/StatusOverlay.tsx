import { HERO_SCENE_COPY, type HeroScenePhase } from "./scene-data";
import classes from "../sections.module.css";

type StatusOverlayProps = {
  phase: HeroScenePhase;
  reducedMotion: boolean;
  serviceCount: number;
};

export function StatusOverlay({ phase, reducedMotion, serviceCount }: StatusOverlayProps) {
  if (reducedMotion) {
    return (
      <div className={classes.heroSceneStatus} aria-hidden="true">
        <div className={classes.heroSceneStatusReduced} data-active="true">
          <p className={classes.heroSceneStatusWarn}>
            <span aria-hidden="true">⚠</span> {HERO_SCENE_COPY.errorTitle}
          </p>
          <p className={classes.heroSceneStatusAccent}>{HERO_SCENE_COPY.reducedFound}</p>
          <p className={classes.heroSceneStatusOk}>
            <span aria-hidden="true">✓</span> {HERO_SCENE_COPY.covered}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={classes.heroSceneStatus} aria-hidden="true">
      <div className={classes.heroSceneStatusLine} data-line="normal" data-active={phase === "normal" ? "true" : "false"}>
        <p>{HERO_SCENE_COPY.normal}</p>
      </div>
      <div className={classes.heroSceneStatusLine} data-line="error" data-active={phase === "error" ? "true" : "false"}>
        <p className={classes.heroSceneStatusWarn}>
          <span aria-hidden="true">⚠</span> {HERO_SCENE_COPY.errorTitle}
        </p>
        <p className={classes.heroSceneStatusSub}>{HERO_SCENE_COPY.errorDetail}</p>
      </div>
      <div className={classes.heroSceneStatusLine} data-line="resolve" data-active={phase === "resolve" ? "true" : "false"}>
        <p>{HERO_SCENE_COPY.resolveSearch}</p>
        <p className={classes.heroSceneStatusAccent}>{HERO_SCENE_COPY.resolveFound}</p>
      </div>
      <div className={classes.heroSceneStatusLine} data-line="covered" data-active={phase === "covered" ? "true" : "false"}>
        <p className={classes.heroSceneStatusOk}>
          <span aria-hidden="true">✓</span> {HERO_SCENE_COPY.covered}
        </p>
        <p className={classes.heroSceneStatusSub}>
          {serviceCount}/{serviceCount} servicios
        </p>
      </div>
    </div>
  );
}
