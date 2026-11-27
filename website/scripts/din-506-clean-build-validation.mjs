#!/usr/bin/env node
/**
 * Simula checkout limpio: copia archivos trackeados de website/, npm ci, build, gate tests, HTTP probe.
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
// dirname used for nested cpSync targets
import { fileURLToPath } from "node:url";

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(websiteRoot, "..");
const out = [];
const log = (m) => {
  out.push(m);
  console.log(m);
};

function sh(cmd, cwd) {
  log(`$ ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

const required = [
  "vite-plugins/cleaning-prerender-html.ts",
  "vite-plugins/cleaning-landing-prerender-plugin.ts",
  "vite-plugins/home-prerender-html.ts",
  "vite-plugins/home-prerender-plugin.ts",
  "vite.config.ts",
];

try {
  const tmp = mkdtempSync(join(tmpdir(), "din506-clean-"));
  const dest = join(tmp, "website");
  mkdirSync(dest, { recursive: true });
  log(`rsync ${websiteRoot}/ → ${dest}/`);
  execSync(
    `rsync -a --delete --exclude node_modules --exclude dist --exclude .din506-http "${websiteRoot}/" "${dest}/"`,
    { stdio: "inherit" },
  );
  mkdirSync(join(tmp, "deploy"), { recursive: true });
  for (const name of [
    "nginx.dinamicoperations.com.conf.template",
    "nginx.bootstrap.dinamicoperations.com.conf.template",
    "nginx.dinamicoperations.com.legacy-unified.conf.template",
    "nginx.bootstrap.dinamicoperations.com.legacy-unified.conf.template",
    "nginx.app.dinamicoperations.com.conf.template",
    "nginx.bootstrap.app.dinamicoperations.com.conf.template",
  ]) {
    cpSync(join(repoRoot, "deploy", name), join(tmp, "deploy", name));
  }
  mkdirSync(join(tmp, "frontend", "public"), { recursive: true });
  for (const rel of ["frontend/public/robots.txt", "frontend/index.html", "frontend/nginx.conf"]) {
    const target = join(tmp, rel);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(repoRoot, rel), target);
  }
  for (const rel of required) {
    if (!existsSync(join(dest, rel))) {
      throw new Error(`missing in clean copy: ${rel} (¿gitignore build/? — usar vite-plugins/)`);
    }
  }
  sh("npm ci", dest);
  sh("npm run build", dest);
  sh("npm run test", dest);
  const httpPort = 18000 + (process.pid % 4000);
  sh(`DIN506_HTTP_PORT=${httpPort} node scripts/din-506-http-probe.mjs`, dest);
  writeFileSync(
    join(repoRoot, "DIN-506-clean-build-validation.md"),
  `# DIN-506 clean build validation\n\nStatus: PASS\nTemp dir: ${tmp}\n\n${out.join("\n")}\n`,
  );
  log("CLEAN BUILD PASS");
  rmSync(tmp, { recursive: true, force: true });
} catch (err) {
  writeFileSync(
    join(repoRoot, "DIN-506-clean-build-validation.md"),
    `# DIN-506 clean build validation\n\nStatus: FAIL\n\n${err.message}\n\n${out.join("\n")}\n`,
  );
  console.error(err);
  process.exit(1);
}