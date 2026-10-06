import classes from "../sections.module.css";

type ChaosAlertProps = {
  id: string;
  label: string;
  x: number;
  y: number;
  urgent?: boolean;
  animate: boolean;
};

export function ChaosAlert({ id, label, x, y, urgent, animate }: ChaosAlertProps) {
  return (
    <div
      className={classes.chaosFlashAlert}
      data-id={id}
      data-urgent={urgent ? "true" : "false"}
      data-animate={animate ? "true" : "false"}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {urgent ? <span className={classes.chaosFlashDot} aria-hidden="true" /> : null}
      {label}
    </div>
  );
}
