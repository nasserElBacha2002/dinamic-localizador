import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  assertEvidenceMatchesCsvExtract,
  parseMetaTariffEvidenceJson,
  validateMetaTariffEvidence,
} from "../utils/whatsapp/whatsapp-meta-tariff-evidence";

const dir = dirname(fileURLToPath(import.meta.url));
const evidencePath = resolve(dir, "whatsapp-meta-tariff-evidence-ar-2026-10.json");
const csvPath = resolve(dir, "meta-usd-list-rates-ar-extract-2026-10.csv");

describe("whatsapp-meta-tariff-evidence-ar-2026-10", () => {
  it("matches Meta USD Argentina list rates CSV extract (SHA-256 bound)", () => {
    const raw = readFileSync(evidencePath, "utf8");
    const csvBody = readFileSync(csvPath, "utf8");
    const evidence = parseMetaTariffEvidenceJson(raw);
    validateMetaTariffEvidence({
      ...evidence,
      officialSource: { ...evidence.officialSource, csvExtractPath: csvPath },
    });
    assertEvidenceMatchesCsvExtract(evidence, csvBody);
    assert.equal(evidence.officialSource.csvSha256, "04a57fd4544ba02f88c2446beee97d5dd40d2ec9a577da0587d6d44c5709d45d");
  });
});