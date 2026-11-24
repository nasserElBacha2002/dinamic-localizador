import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { CLEANING_LANDING_SEO } from "../content/cleaning-landing-content";

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("cleaning landing SEO (software-empresas-limpieza/index.html)", () => {
  it("incluye title, description, canonical y og alineados con CLEANING_LANDING_SEO", () => {
    const html = readFileSync(join(websiteRoot, "software-empresas-limpieza/index.html"), "utf8");

    assert.match(html, new RegExp(`<title>${escapeRegex(CLEANING_LANDING_SEO.title)}</title>`));
    assert.match(
      html,
      new RegExp(
        `<meta\\s+name="description"\\s+content="${escapeRegex(CLEANING_LANDING_SEO.description)}"\\s*/>`,
      ),
    );
    assert.match(
      html,
      new RegExp(`<meta property="og:title" content="${escapeRegex(CLEANING_LANDING_SEO.title)}"\\s*/>`),
    );
    assert.match(
      html,
      new RegExp(
        `<meta\\s+property="og:description"\\s+content="${escapeRegex(CLEANING_LANDING_SEO.description)}"\\s*/>`,
      ),
    );
    assert.match(
      html,
      new RegExp(`<link rel="canonical" href="${escapeRegex(CLEANING_LANDING_SEO.canonicalUrl)}"\\s*/>`),
    );
    assert.match(
      html,
      new RegExp(`<meta property="og:url" content="${escapeRegex(CLEANING_LANDING_SEO.canonicalUrl)}"\\s*/>`),
    );
    assert.doesNotMatch(html, /<meta name="robots" content="noindex/i);
  });
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}