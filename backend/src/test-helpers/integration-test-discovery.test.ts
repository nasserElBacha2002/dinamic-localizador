import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const collectIntegrationTests = (dir: string, acc: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      collectIntegrationTests(path, acc);
      continue;
    }
    if (name.endsWith(".integration.test.ts")) {
      acc.push(path);
    }
  }
  return acc;
};

describe("run-integration-tests discovery", () => {
  it("finds nested *.integration.test.ts including historical-seed", () => {
    const srcRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
    const files = collectIntegrationTests(srcRoot);
    assert.ok(files.length > 40, `expected many integration files, got ${files.length}`);
    assert.ok(
      files.some((path) => path.includes("historical-seed.integration.test.ts")),
      "historical-seed integration suite must be discoverable",
    );
    assert.ok(
      files.some((path) => path.includes("individual-recommendation.integration.test.ts")),
    );
  });
});
