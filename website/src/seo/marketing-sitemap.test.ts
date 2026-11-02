import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { LANDING_SEO } from "../content/landing-content";

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = join(websiteRoot, "..");

describe("marketing sitemap", () => {
  it("publica la landing canónica y apunta robots.txt al sitemap del apex", () => {
    const sitemap = readFileSync(join(websiteRoot, "public/sitemap.xml"), "utf8");
    const robots = readFileSync(join(websiteRoot, "public/robots.txt"), "utf8");

    assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    assert.equal(sitemap.includes(`<loc>${LANDING_SEO.canonicalUrl}</loc>`), true);
    assert.equal(sitemap.includes("#"), false);
    assert.match(robots, /^Sitemap: https:\/\/dinamicoperations\.com\/sitemap\.xml$/m);
    assert.match(robots, /^Allow: \/\$/m);
    assert.match(robots, /^Disallow: \/$/m);
  });

  it("el Nginx del host apex puede enviar sitemap y robots al website", () => {
    const templates = [
      "deploy/nginx.dinamicoperations.com.conf.template",
      "deploy/nginx.bootstrap.dinamicoperations.com.conf.template",
    ];

    for (const relative of templates) {
      const template = readFileSync(join(repoRoot, relative), "utf8");
      assert.match(template, /location = \/sitemap\.xml \{/);
      assert.match(template, /location = \/robots\.txt \{/);
      assert.match(template, /proxy_pass http:\/\/127\.0\.0\.1:\$\{WEBSITE_HOST_PORT\}/);
      assert.doesNotMatch(template, /proxy_pass http:\/\/127\.0\.0\.1:\$\{FRONTEND_HOST_PORT\}/);
    }
  });

  it("las plantillas apex incluyen redirects legacy selectivos hacia APP_PUBLIC_ORIGIN", () => {
    for (const relative of [
      "deploy/nginx.dinamicoperations.com.conf.template",
      "deploy/nginx.bootstrap.dinamicoperations.com.conf.template",
    ]) {
      const template = readFileSync(join(repoRoot, relative), "utf8");
      assert.match(template, /\$\{APP_PUBLIC_ORIGIN\}\/login\$is_args\$args/);
      assert.match(template, /\$\{APP_PUBLIC_ORIGIN\}\/reset-password\$is_args\$args/);
      assert.match(template, /location ~ \^\/\(operations\|employees\|absences\|settings\|platform\)\(\/\|\$\)/);
    }
  });
});

describe("app SEO policy (separate from website)", () => {
  it("frontend robots bloquea todo el sitio y no referencia sitemap de marketing", () => {
    const robots = readFileSync(join(repoRoot, "frontend/public/robots.txt"), "utf8");
    assert.match(robots, /^Disallow: \/$/m);
    assert.equal(robots.includes("Sitemap:"), false);
  });

  it("frontend index incluye noindex", () => {
    const html = readFileSync(join(repoRoot, "frontend/index.html"), "utf8");
    assert.match(html, /<meta name="robots" content="noindex, nofollow"\s*\/?>/);
  });

  it("frontend no publica sitemap de marketing en public/", () => {
    let threw = false;
    try {
      readFileSync(join(repoRoot, "frontend/public/sitemap.xml"), "utf8");
    } catch {
      threw = true;
    }
    assert.equal(threw, true);
  });

  it("nginx del contenedor frontend devuelve 404 en /sitemap.xml", () => {
    const nginx = readFileSync(join(repoRoot, "frontend/nginx.conf"), "utf8");
    assert.match(nginx, /location = \/sitemap\.xml \{\s*\n\s*return 404;/);
    assert.match(nginx, /X-Robots-Tag "noindex, nofollow"/);
  });

  it("plantilla Nginx app incluye X-Robots-Tag y no proxy /api", () => {
    for (const relative of [
      "deploy/nginx.app.dinamicoperations.com.conf.template",
      "deploy/nginx.bootstrap.app.dinamicoperations.com.conf.template",
    ]) {
      const template = readFileSync(join(repoRoot, relative), "utf8");
      assert.match(template, /server_name app\.dinamicoperations\.com;/);
      assert.match(template, /X-Robots-Tag "noindex, nofollow"/);
      assert.match(template, /location = \/sitemap\.xml \{\s*\n\s*return 404;/);
      assert.match(template, /location \/api\/ \{\s*\n\s*return 404;/);
      assert.match(template, /proxy_pass http:\/\/127\.0\.0\.1:\$\{FRONTEND_HOST_PORT\}/);
    }
  });
});
