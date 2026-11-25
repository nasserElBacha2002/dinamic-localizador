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
    assert.match(conf, new RegExp(`location = ${marketingPath} \\{\\s*\\n\\s*return 301 ${marketingPath}/\\$is_args\\$args;`));
    assert.match(conf, new RegExp(`location = ${marketingPath}/`));
    assert.match(conf, /try_files \/software-empresas-limpieza\/index\.html =404;/);
    assert.match(conf, /location ~ \^\/software-empresas-limpieza\/\.\+/);
    assert.doesNotMatch(conf, /location \^~ \/software-empresas-limpieza {/);
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
    });
  }
});