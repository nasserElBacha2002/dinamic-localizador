import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { LANDING_SEO } from "../content/landing-content";

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = join(websiteRoot, "..");

describe("marketing sitemap", () => {
  it("publica la landing canónica y apunta robots.txt al sitemap", () => {
    const sitemap = readFileSync(join(websiteRoot, "public/sitemap.xml"), "utf8");
    const robots = readFileSync(join(websiteRoot, "public/robots.txt"), "utf8");

    assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    assert.equal(sitemap.includes(`<loc>${LANDING_SEO.canonicalUrl}</loc>`), true);
    assert.equal(sitemap.includes("#"), false);
    assert.match(robots, /^Sitemap: https:\/\/dinamicoperations\.com\/sitemap\.xml$/m);
    assert.match(robots, /^Allow: \/\$/m);
    assert.match(robots, /^Disallow: \/$/m);
  });

  it("el Nginx del dominio envía sitemap y robots al website, no a la app", () => {
    const templates = [
      "deploy/nginx.dinamicoperations.com.conf.template",
      "deploy/nginx.bootstrap.dinamicoperations.com.conf.template",
    ];

    for (const relative of templates) {
      const template = readFileSync(join(repoRoot, relative), "utf8");
      assert.match(template, /location = \/sitemap\.xml \{/);
      assert.match(template, /location = \/robots\.txt \{/);
      assert.match(template, /proxy_pass http:\/\/127\.0\.0\.1:\$\{WEBSITE_HOST_PORT\}/);
    }
  });
});
