import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function readDeploy(relative: string): string {
  return readFileSync(join(repoRoot, relative), "utf8");
}

describe("nginx domain separation templates", () => {
  const legacyHttps = "deploy/nginx.dinamicoperations.com.legacy-unified.conf.template";
  const separatedHttps = "deploy/nginx.dinamicoperations.com.conf.template";

  it("legacy unified apex proxies /login and catch-all to frontend", () => {
    const template = readDeploy(legacyHttps);
    assert.doesNotMatch(template, /\$\{APP_PUBLIC_ORIGIN\}/);
    assert.match(template, /location = \/ \{\s*\n\s*proxy_pass http:\/\/127\.0\.0\.1:\$\{WEBSITE_HOST_PORT\}/);
    assert.match(
      template,
      /location \/ \{\s*\n\s*proxy_pass http:\/\/127\.0\.0\.1:\$\{FRONTEND_HOST_PORT\}/,
    );
    assert.doesNotMatch(template, /return 301 \$\{APP_PUBLIC_ORIGIN\}\/login/);
  });

  it("separated apex sends / to website and redirects /login to app origin", () => {
    const template = readDeploy(separatedHttps);
    assert.match(template, /return 301 \$\{APP_PUBLIC_ORIGIN\}\/login\$is_args\$args/);
    assert.match(template, /location = \/ \{\s*\n\s*proxy_pass http:\/\/127\.0\.0\.1:\$\{WEBSITE_HOST_PORT\}/);
    assert.doesNotMatch(
      template,
      /location \/ \{\s*\n\s*proxy_pass http:\/\/127\.0\.0\.1:\$\{FRONTEND_HOST_PORT\}/,
    );
  });

  it("legacy bootstrap matches unified routing (no app redirects)", () => {
    const template = readDeploy("deploy/nginx.bootstrap.dinamicoperations.com.legacy-unified.conf.template");
    assert.doesNotMatch(template, /\$\{APP_PUBLIC_ORIGIN\}/);
    assert.match(template, /proxy_pass http:\/\/127\.0\.0\.1:\$\{FRONTEND_HOST_PORT\}/);
  });

  it("separated bootstrap uses APP_PUBLIC_ORIGIN redirects, not frontend proxy", () => {
    const template = readDeploy("deploy/nginx.bootstrap.dinamicoperations.com.conf.template");
    assert.match(template, /\$\{APP_PUBLIC_ORIGIN\}\/login\$is_args\$args/);
    assert.doesNotMatch(template, /proxy_pass http:\/\/127\.0\.0\.1:\$\{FRONTEND_HOST_PORT\}/);
  });
});
