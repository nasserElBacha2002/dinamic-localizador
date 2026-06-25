import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { resolveGoogleMapsApiKey } from "./env";

describe("resolveGoogleMapsApiKey", () => {
  it("reads VITE_GOOGLE_MAPS_API_KEY from frontend .env", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "reconcile-env-"));
    const previousGoogle = process.env.GOOGLE_MAPS_API_KEY;
    const previousVite = process.env.VITE_GOOGLE_MAPS_API_KEY;

    try {
      mkdirSync(join(tempDir, "frontend"), { recursive: true });
      writeFileSync(
        join(tempDir, "frontend", ".env"),
        "VITE_GOOGLE_MAPS_API_KEY=test-key-from-frontend\n",
        "utf8",
      );

      delete process.env.GOOGLE_MAPS_API_KEY;
      delete process.env.VITE_GOOGLE_MAPS_API_KEY;

      const resolved = resolveGoogleMapsApiKey(tempDir);

      assert.equal(resolved.key, "test-key-from-frontend");
      assert.equal(resolved.source, "VITE_GOOGLE_MAPS_API_KEY");
    } finally {
      if (previousGoogle === undefined) {
        delete process.env.GOOGLE_MAPS_API_KEY;
      } else {
        process.env.GOOGLE_MAPS_API_KEY = previousGoogle;
      }

      if (previousVite === undefined) {
        delete process.env.VITE_GOOGLE_MAPS_API_KEY;
      } else {
        process.env.VITE_GOOGLE_MAPS_API_KEY = previousVite;
      }

      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("prefers GOOGLE_MAPS_API_KEY when both are set", () => {
    const previousGoogle = process.env.GOOGLE_MAPS_API_KEY;
    const previousVite = process.env.VITE_GOOGLE_MAPS_API_KEY;

    try {
      process.env.GOOGLE_MAPS_API_KEY = "server-key";
      process.env.VITE_GOOGLE_MAPS_API_KEY = "vite-key";

      const resolved = resolveGoogleMapsApiKey();
      assert.equal(resolved.key, "server-key");
      assert.equal(resolved.source, "GOOGLE_MAPS_API_KEY");
    } finally {
      if (previousGoogle === undefined) {
        delete process.env.GOOGLE_MAPS_API_KEY;
      } else {
        process.env.GOOGLE_MAPS_API_KEY = previousGoogle;
      }

      if (previousVite === undefined) {
        delete process.env.VITE_GOOGLE_MAPS_API_KEY;
      } else {
        process.env.VITE_GOOGLE_MAPS_API_KEY = previousVite;
      }
    }
  });
});
