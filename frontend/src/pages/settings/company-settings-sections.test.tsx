import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("Company settings operation vs WhatsApp labels", () => {
  it("keeps operation and WhatsApp tolerances in separate labeled fields", () => {
    const formFile = readFileSync(
      join(process.cwd(), "src/pages/settings/components/OperationalSettingsForm.tsx"),
      "utf8",
    );

    assert.match(formFile, /Tolerancia de llegada tardía para operaciones \(min\)/);
    assert.match(formFile, /Tolerancia de puntualidad WhatsApp \(min\)/);
    assert.match(formFile, /Tolerancia de salida anticipada WhatsApp \(min\)/);
    assert.match(formFile, /Radio permitido por defecto \(m\)/);
    assert.doesNotMatch(
      formFile,
      /Tolerancia de puntualidad WhatsApp[\s\S]*Radio permitido por defecto/,
    );
  });
});
