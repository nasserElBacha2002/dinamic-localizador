import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { buildPrivacyPrerenderHtml } from "../../vite-plugins/privacy-prerender-html";
import { PRIVACY_POLICY, PRIVACY_POLICY_SEO } from "../content/privacy-policy-content";
import { requireDistOrGate } from "../test/din-506-gate";

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const distPath = join(websiteRoot, "dist/privacidad/index.html");

describe("privacy policy prerender", () => {
  it("genera título, secciones y el texto completo desde la fuente única", () => {
    const html = buildPrivacyPrerenderHtml();
    assert.match(html, new RegExp(`<h1>${escapeRegex(PRIVACY_POLICY.heading)}</h1>`));
    assert.match(html, /id="privacy-seo-prerender"/);
    for (const section of PRIVACY_POLICY.sections) {
      assert.match(html, new RegExp(`<h2>${escapeRegex(section.title)}</h2>`));
      assert.equal(html.includes(section.body), true);
    }
  });

  it("el HTML inicial de dist no es la home y ya trae la política", (t) => {
    const skip = requireDistOrGate(existsSync(distPath), "dist prerender privacidad");
    if (skip === "skip") {
      t.skip("SKIPPED: dist/ ausente (ejecutar npm run build o DIN506_GATE=1)");
      return;
    }
    const built = readFileSync(distPath, "utf8");
    assert.match(built, new RegExp(`<title>${escapeRegex(PRIVACY_POLICY_SEO.title)}</title>`));
    assert.match(built, new RegExp(`<link rel="canonical" href="${escapeRegex(PRIVACY_POLICY_SEO.canonicalUrl)}"`));
    assert.match(built, /id="privacy-seo-prerender"/);
    assert.equal(built.includes(PRIVACY_POLICY.heading), true);
    assert.equal(built.includes("Nasser El Bacha"), true);
    assert.equal(built.includes("Ley 25.326"), true);
    assert.doesNotMatch(built, /<title>Software de gestión de personal y servicios \| Dinamic Operations<\/title>/);
    assert.doesNotMatch(built, /<meta name="robots" content="noindex/i);
  });
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
