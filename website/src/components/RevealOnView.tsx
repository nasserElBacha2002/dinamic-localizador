import type { ReactNode } from "react";
import { useInView } from "../hooks/useInView";
import classes from "./reveal-on-view.module.css";

type RevealOnViewProps = {
  children: ReactNode;
  className?: string;
  as?: "div" | "section";
  id?: string;
  "aria-labelledby"?: string;
};

export function RevealOnView({
  children,
  className,
  as: Tag = "div",
  id,
  "aria-labelledby": ariaLabelledby,
}: RevealOnViewProps) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.2 });
  return (
    <Tag
      ref={ref}
      id={id}
      aria-labelledby={ariaLabelledby}
      className={`${classes.reveal} ${inView ? classes.revealVisible : ""} ${className ?? ""}`}
    >
      {children}
    </Tag>
  );
}
