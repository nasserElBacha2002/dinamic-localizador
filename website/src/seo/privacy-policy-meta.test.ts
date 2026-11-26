import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PRIVACY_POLICY_SEO } from "../content/privacy-policy-content";

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("privacy policy SEO (privacidad/index.html)", () => {
  it("incluye title, description, canonical y og indexables", () => {
    const html = readFileSync(join(websiteRoot, "privacidad/index.html"), "utf8");

    assert.match(html, new RegExp(`<title>${escapeRegex(PRIVACY_POLICY_SEO.title)}</title>`));
    assert.match(
      html,
      new RegExp(
        `<meta\\s+name="description"\\s+content="${escapeRegex(PRIVACY_POLICY_SEO.description)}"\\s*/>`,
      ),
    );
    assert.match(
      html,
      new RegExp(`<meta property="og:title" content="${escapeRegex(PRIVACY_POLICY_SEO.title)}"\\s*/>`),
    );
    assert.match(
      html,
      new RegExp(
        `<meta\\s+property="og:description"\\s+content="${escapeRegex(PRIVACY_POLICY_SEO.description)}"\\s*/>`,
      ),
    );
    assert.match(
      html,
      new RegExp(`<link rel="canonical" href="${escapeRegex(PRIVACY_POLICY_SEO.canonicalUrl)}"\\s*/>`),
    );
    assert.match(
      html,
      new RegExp(`<meta property="og:url" content="${escapeRegex(PRIVACY_POLICY_SEO.canonicalUrl)}"\\s*/>`),
    );
    assert.doesNotMatch(html, /<meta name="robots" content="noindex/i);
    assert.doesNotMatch(html, /gtag|googletagmanager|linkedin\.com\/px|insight/i);
  });
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
