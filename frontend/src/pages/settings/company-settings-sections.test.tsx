import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("Company settings operation vs WhatsApp labels", () => {
  it("keeps operation and WhatsApp tolerances in separate labeled fields", () => {
    const sectionFile = readFileSync(
      join(process.cwd(), "src/pages/settings/components/CompanyOperationalSettingsSection.tsx"),
      "utf8",
    );

    assert.match(sectionFile, /Tolerancia de llegada tardía para operaciones \(min\)/);
    assert.match(sectionFile, /Tolerancia de puntualidad WhatsApp \(min\)/);
    assert.match(sectionFile, /Tolerancia de salida anticipada WhatsApp \(min\)/);
    assert.match(sectionFile, /Radio permitido por defecto \(m\)/);
    assert.doesNotMatch(
      sectionFile,
      /Tolerancia de puntualidad WhatsApp[\s\S]*Radio permitido por defecto/,
    );
  });
});
