/** RFC 5987 Content-Disposition filename* for Unicode-safe downloads. */
export const buildContentDisposition = (
  disposition: "inline" | "attachment",
  fileName: string,
): string => {
  const asciiFallback = fileName
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_")
    .slice(0, 180) || "file";
  const encoded = encodeURIComponent(fileName).replace(/['()]/g, escape);
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
};
