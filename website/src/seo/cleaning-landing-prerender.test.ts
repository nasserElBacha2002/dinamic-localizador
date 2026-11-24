import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { buildCleaningPrerenderHtml } from "../../vite-plugins/cleaning-prerender-html";
import { CLEANING_LANDING_DASHBOARD_IMAGE, CLEANING_LANDING_HERO } from "../content/cleaning-landing-content";
import { isDin506GateEnabled, requireDistOrGate } from "../test/din-506-gate";

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = join(websiteRoot, "..");
const distPath = join(websiteRoot, "dist/software-empresas-limpieza/index.html");

describe("cleaning landing prerender modules", () => {
  it("vite-plugins fuente está presente (no bajo website/build ignorado)", () => {
    assert.equal(existsSync(join(websiteRoot, "vite-plugins/cleaning-prerender-html.ts")), true);
    assert.equal(existsSync(join(websiteRoot, "vite-plugins/cleaning-landing-prerender-plugin.ts")), true);
    if (existsSync(join(repoRoot, ".git"))) {
      const ignore = execCheckIgnore(join(websiteRoot, "vite-plugins/cleaning-prerender-html.ts"));
      assert.equal(ignore, null, `gitignore bloquea el módulo: ${ignore ?? ""}`);
    }
  });

  it("genera H1, enlaces y copy desde la fuente única", () => {
    const html = buildCleaningPrerenderHtml();
    assert.match(html, new RegExp(`<h1>${escapeRegex(CLEANING_LANDING_HERO.title)}</h1>`));
    assert.match(html, /href="\/#solicitar-demo"/);
    assert.match(html, /href="\//);
    assert.match(html, new RegExp(`src="${escapeRegex(CLEANING_LANDING_DASHBOARD_IMAGE.src)}"`));
  });

  it("dist incluye el bloque prerender tras el build", async (t) => {
    const skip = requireDistOrGate(existsSync(distPath), "dist prerender");
    if (skip === "skip") {
      t.skip("SKIPPED: dist/ ausente (ejecutar npm run build o DIN506_GATE=1)");
      return;
    }
    const built = readFileSync(distPath, "utf8");
    assert.match(built, /id="cleaning-seo-prerender"/);
    assert.match(built, new RegExp(escapeRegex(CLEANING_LANDING_HERO.title)));
  });

  it("incluye la captura WebP del tablero en public/", () => {
    const imagePath = join(websiteRoot, "public", CLEANING_LANDING_DASHBOARD_IMAGE.src.replace(/^\//, ""));
    assert.equal(existsSync(imagePath), true);
    if (isDin506GateEnabled()) {
      assert.match(readFileSync(imagePath).subarray(0, 4).toString("ascii"), /^RIFF/);
    }
  });
});

function execCheckIgnore(path: string): string | null {
  try {
    return execSync(`git check-ignore -v ${JSON.stringify(path)}`, {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}