#!/usr/bin/env node
/**
 * Validaciones de artefacto estático y preview para DIN-471 corrections (sin Playwright).
 * Uso: node scripts/din-471-corrections-browser-probe.mjs [baseUrl]
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const websiteRoot = join(__dirname, "..");
const base = (process.argv[2] ?? "http://127.0.0.1:4177").replace(/\/$/, "");
const distIndex = join(websiteRoot, "dist/index.html");

const ANCHORS = ["como-funciona", "situaciones", "solicitar-demo", "preguntas-frecuentes"];

function fragmentFromHref(href) {
  const hash = href.indexOf("#");
  if (hash === -1) return null;
  return href.slice(hash + 1).split("?")[0] || null;
}

function assertFragmentLinksResolvable(html, label) {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const bad = [];
  for (const m of html.matchAll(/\bhref="([^"#][^"]*#[^"]+|#[^"]+)"/g)) {
    const frag = fragmentFromHref(m[1]);
    if (frag && !ids.has(frag)) bad.push(m[1]);
  }
  if (bad.length) {
    throw new Error(`${label}: enlaces a fragmentos sin id destino: ${bad.join(", ")}`);
  }
}

function assertAnchorSections(html, label) {
  for (const id of ANCHORS) {
    if (!html.includes(`id="${id}"`)) {
      throw new Error(`${label}: falta sección ancla id="${id}"`);
    }
  }
}

const results = [];

try {
  const built = readFileSync(distIndex, "utf8");
  assertAnchorSections(built, "dist/index.html");
  assertFragmentLinksResolvable(built, "dist/index.html");
  results.push("STATIC dist/index.html: fragmentos y anclas OK");
} catch (e) {
  results.push(`STATIC dist/index.html: FAIL ${e.message}`);
  process.exitCode = 1;
}

const paths = ["/", "/software-empresas-limpieza/", "/privacidad/", "/robots.txt", "/sitemap.xml"];

for (const path of paths) {
  try {
    const res = await fetch(`${base}${path}`);
    const body = await res.text();
    results.push(`HTTP ${path}: ${res.status} (${body.length} bytes)`);
    if (path === "/") {
      assertAnchorSections(body, `GET ${path}`);
      assertFragmentLinksResolvable(body, `GET ${path}`);
      results.push("LIVE /: fragmentos y anclas OK");
    }
  } catch (e) {
    results.push(`HTTP ${path}: FAIL ${e.message}`);
    process.exitCode = 1;
  }
}

console.log(results.join("\n"));