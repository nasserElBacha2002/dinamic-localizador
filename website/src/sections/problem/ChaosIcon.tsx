import type { ChaosIconKind } from "./chaos-data";
import classes from "../sections.module.css";

const ICON_GLYPH: Record<ChaosIconKind, string> = {
  chat: "✉",
  phone: "☎",
  sheet: "▤",
  clock: "◷",
  alert: "▲",
  map: "⌖",
  user: "◉",
  pending: "…",
};

type ChaosIconProps = {
  kind: ChaosIconKind;
};

export function ChaosIcon({ kind }: ChaosIconProps) {
  return (
    <span className={classes.chaosNodeIcon} aria-hidden="true">
      {ICON_GLYPH[kind]}
    </span>
  );
}
