import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const prodCompose = readFileSync(join(repoRoot, "docker-compose.prod.yml"), "utf8");

describe("docker-compose.prod marketing env preflight", () => {
  it("requires SMTP credentials but not MARKETING_DEMO_LEAD_TO at compose parse time", () => {
    assert.match(prodCompose, /SMTP_PASSWORD: \$\{SMTP_PASSWORD:\?SMTP_PASSWORD is required\}/);
    assert.match(prodCompose, /MARKETING_DEMO_LEAD_TO: \$\{MARKETING_DEMO_LEAD_TO:-\}/);
    assert.doesNotMatch(prodCompose, /MARKETING_DEMO_LEAD_TO:\?\?/);
  });

  it("rota los logs json-file del backend a 10m por 3 archivos", () => {
    assert.match(prodCompose, /driver: json-file/);
    assert.match(prodCompose, /max-size: "10m"/);
    assert.match(prodCompose, /max-file: "3"/);
  });
});