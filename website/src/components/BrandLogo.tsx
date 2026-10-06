type BrandLogoProps = {
  className?: string;
};

/**
 * Wordmark provisional — TODO: replace with official master SVG in public/brand/.
 * No usar geometría de logo definitiva inventada en código.
 */
export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <span className={className} aria-label="Dinamic Operations">
      <span aria-hidden="true">Dinamic Operations</span>
    </span>
  );
}
