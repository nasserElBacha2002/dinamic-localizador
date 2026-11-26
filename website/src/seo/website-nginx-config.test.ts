import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = join(websiteRoot, "..");

const marketingPath = "/software-empresas-limpieza";

describe("website nginx.conf", () => {
  it("redirige sin barra, sirve solo la raíz sectorial y 404 en subrutas", () => {
    const conf = readFileSync(join(websiteRoot, "nginx.conf"), "utf8");
    assert.match(conf, /absolute_redirect off;/);
    assert.match(conf, /charset utf-8;/);
    assert.match(conf, new RegExp(`location = ${marketingPath} \\{\\s*\\n\\s*return 301 ${marketingPath}/\\$is_args\\$args;`));
    assert.match(conf, new RegExp(`location = ${marketingPath}/`));
    assert.match(conf, /try_files \/software-empresas-limpieza\/index\.html =404;/);
    assert.match(conf, /location ~ \^\/software-empresas-limpieza\/\.\+/);
    assert.doesNotMatch(conf, /location \^~ \/software-empresas-limpieza {/);
    assert.doesNotMatch(conf, /try_files \$uri \$uri\/ \/index\.html;/);
  });

  it("redirige /index.html a / y responde 404 real en rutas no publicadas", () => {
    const conf = readFileSync(join(websiteRoot, "nginx.conf"), "utf8");
    const notFound = readFileSync(join(websiteRoot, "public/404.html"), "utf8");
    assert.match(conf, /location = \/index\.html \{\s*\n\s*return 301 \/\$is_args\$args;/);
    assert.match(conf, /error_page 404 \/404\.html;/);
    assert.match(conf, /location = \/404\.html \{\s*\n\s*internal;/);
    assert.match(conf, /X-Robots-Tag "noindex, nofollow"/);
    assert.match(conf, /location \/video\/ \{\s*\n\s*try_files \$uri =404;/);
    assert.match(conf, /location \/ \{\s*\n\s*return 404;/);
    assert.match(notFound, /<meta name="robots" content="noindex, nofollow"\s*\/>/);
    assert.doesNotMatch(notFound, /rel="canonical"/);
  });
});

describe("apex nginx templates", () => {
  const templates = [
    "deploy/nginx.dinamicoperations.com.conf.template",
    "deploy/nginx.bootstrap.dinamicoperations.com.conf.template",
    "deploy/nginx.dinamicoperations.com.legacy-unified.conf.template",
    "deploy/nginx.bootstrap.dinamicoperations.com.legacy-unified.conf.template",
  ];
  const deployAvailable = existsSync(join(repoRoot, "deploy/nginx.dinamicoperations.com.conf.template"));

  for (const relative of templates) {
    it(`${relative} enruta solo rutas exactas de la landing al website`, (t) => {
      if (!deployAvailable) {
        t.skip("SKIPPED: deploy/ no presente (solo checkout website)");
        return;
      }
      const template = readFileSync(join(repoRoot, relative), "utf8");
      assert.match(template, new RegExp(`location = ${marketingPath} {`));
      assert.match(template, new RegExp(`location \\^~ ${marketingPath}/`));
      assert.doesNotMatch(template, new RegExp(`location \\^~ ${marketingPath} {`));
      assert.match(template, /proxy_pass http:\/\/127\.0\.0\.1:\$\{WEBSITE_HOST_PORT\}/);
      if (relative.includes("bootstrap.")) {
        assert.match(
          template,
          new RegExp(
            `location = ${marketingPath} \\{\\s*\\n\\s*return 301 \\$scheme://\\$host${marketingPath}/\\$is_args\\$args;`,
          ),
        );
      } else {
        assert.match(
          template,
          new RegExp(
            `location = ${marketingPath} \\{\\s*\\n\\s*return 301 https://dinamicoperations\\.com${marketingPath}/\\$is_args\\$args;`,
          ),
        );
      }
    });
  }
});