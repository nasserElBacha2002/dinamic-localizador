import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isDin506GateEnabled, requireDistOrGate, requireDockerOrGate } from "../test/din-506-gate";

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const distLanding = join(websiteRoot, "dist/software-empresas-limpieza/index.html");

async function dockerAvailable(): Promise<boolean> {
  try {
    const { execSync } = await import("node:child_process");
    execSync("docker version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("cleaning landing HTTP (docker + dist)", () => {
  it("ejecuta din-506-http-probe cuando DIN506_GATE=1", async (t) => {
    const distSkip = requireDistOrGate(existsSync(distLanding), "HTTP probe");
    if (distSkip === "skip") {
      t.skip("SKIPPED: dist/ ausente");
      return;
    }
    const docker = await dockerAvailable();
    const dockerSkip = await requireDockerOrGate(docker, "HTTP probe");
    if (dockerSkip === "skip") {
      t.skip("SKIPPED: Docker no disponible");
      return;
    }
  if (!isDin506GateEnabled()) {
      t.skip("SKIPPED: definir DIN506_GATE=1 para integración HTTP obligatoria");
      return;
    }
    const { execSync } = await import("node:child_process");
    const port = 18000 + (process.pid % 4000);
    execSync("node scripts/din-506-http-probe.mjs", {
      cwd: websiteRoot,
      stdio: "inherit",
      env: { ...process.env, DIN506_HTTP_PORT: String(port) },
    });
    assert.ok(existsSync(join(websiteRoot, "..", "DIN-506-http-validation.md")));
  });
});