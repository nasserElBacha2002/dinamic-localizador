import { BRAND_ISOTIPO_SRC, BRAND_REVERSO_SRC } from "./brand-assets";

type DinamicIsotypeProps = {
  className?: string;
  variant?: "color" | "reverse";
  title?: string;
};

export function DinamicIsotype({ className, variant = "color", title }: DinamicIsotypeProps) {
  const src = variant === "reverse" ? BRAND_REVERSO_SRC : BRAND_ISOTIPO_SRC;

  return (
    <img
      className={className}
      src={src}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      decoding="async"
    />
  );
}
