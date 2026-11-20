import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { LANDING_SEO } from "../content/landing-content";

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("landing home SEO (index.html)", () => {
  it("incluye title, description, canonical y og alineados con LANDING_SEO", () => {
    const html = readFileSync(join(websiteRoot, "index.html"), "utf8");

    assert.match(html, new RegExp(`<title>${escapeRegex(LANDING_SEO.title)}</title>`));
    assert.match(
      html,
      new RegExp(
        `<meta\\s+name="description"\\s+content="${escapeRegex(LANDING_SEO.description)}"\\s*/>`,
      ),
    );
    assert.match(
      html,
      new RegExp(`<meta property="og:title" content="${escapeRegex(LANDING_SEO.title)}"\\s*/>`),
    );
    assert.match(
      html,
      new RegExp(
        `<meta\\s+property="og:description"\\s+content="${escapeRegex(LANDING_SEO.description)}"\\s*/>`,
      ),
    );
    assert.match(
      html,
      new RegExp(`<link rel="canonical" href="${escapeRegex(LANDING_SEO.canonicalUrl)}"\\s*/>`),
    );
    assert.match(
      html,
      new RegExp(`<meta property="og:url" content="${escapeRegex(LANDING_SEO.canonicalUrl)}"\\s*/>`),
    );
  });
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}