import type { CSSProperties } from "react";
import { ChaosIcon } from "./ChaosIcon";
import type { ChaosNodeDef } from "./chaos-data";
import { chaosNodeIsLinked } from "./chaos-data";
import classes from "../sections.module.css";

type ChaosNodeProps = {
  node: ChaosNodeDef;
  animate: boolean;
  highlighted: boolean;
  highlightId: string | null;
  onHighlight: (id: string | null) => void;
  layout: "desktop" | "mobile";
};

export function ChaosNode({ node, animate, highlighted, highlightId, onHighlight, layout }: ChaosNodeProps) {
  const linked = chaosNodeIsLinked(node.id, highlightId);

  const style: CSSProperties = {
    ...({
      "--node-rot": `${node.rotate}deg`,
      "--float-delay": `${node.floatDelay}s`,
      "--mobile-order": node.mobileOrder,
    } as CSSProperties),
    ...(layout === "mobile"
      ? {
          left: node.mobileOrder % 2 === 0 ? "22%" : "58%",
          top: `calc(5% + ${node.mobileOrder * 6.2}%)`,
        }
      : {
          left: `${node.x}%`,
          top: `${node.y}%`,
        }),
  };

  return (
    <span
      className={classes.chaosNode}
      data-layout={layout}
      data-animate={animate ? "true" : "false"}
      data-highlight={highlighted ? "true" : "false"}
      data-linked={linked ? "true" : "false"}
      data-scale={node.scale ?? "md"}
      data-urgent={node.urgent ? "true" : "false"}
      data-node-id={node.id}
      style={style}
      onMouseEnter={() => onHighlight(node.id)}
      onMouseLeave={() => onHighlight(null)}
    >
      <ChaosIcon kind={node.icon} />
      <span className={classes.chaosNodeLabel}>{node.label}</span>
      {node.urgent ? (
        <span className={classes.chaosNodeUrgent} aria-hidden="true">
          urgente
        </span>
      ) : null}
    </span>
  );
}
