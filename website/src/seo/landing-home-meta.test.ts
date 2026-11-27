import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { LANDING_OG_IMAGE } from "../content/landing-editorial";
import { LANDING_SEO } from "../content/landing-content";
import { buildHomeJsonLd } from "../content/landing-editorial";

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
    assert.match(html, /<html lang="es">/);
  });

  it("JSON-LD home es parseable y coherente con LANDING_SEO", () => {
    const raw = buildHomeJsonLd();
    const graph = JSON.parse(raw) as { "@graph": { "@type": string; description?: string }[] };
    assert.ok(Array.isArray(graph["@graph"]));
    const app = graph["@graph"].find(
      (n) => n["@type"] === "WebApplication" || n["@type"] === "SoftwareApplication",
    );
    assert.equal(app?.description, LANDING_SEO.description);
  });

  it("og:image usa asset de marca verificable", () => {
    assert.equal(LANDING_OG_IMAGE.url, "https://dinamicoperations.com/brand/dinamic-operations-logo.png");
    assert.equal(LANDING_OG_IMAGE.width, 480);
    assert.equal(LANDING_OG_IMAGE.height, 150);
    assert.ok(existsSync(join(websiteRoot, "public", "brand", "dinamic-operations-logo.png")));
  });
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}