import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("Company operational tolerance labels", () => {
  it("shows one channel-neutral field for each timing concept", () => {
    const formFile = readFileSync(
      join(process.cwd(), "src/pages/settings/components/OperationalSettingsForm.tsx"),
      "utf8",
    );

    assert.match(formFile, /Tolerancia de llegada temprana \(min\)/);
    assert.match(formFile, /Tolerancia de llegada tardía \(min\)/);
    assert.match(formFile, /Tolerancia de salida anticipada \(min\)/);
    assert.match(formFile, /Radio permitido por defecto \(m\)/);
    assert.doesNotMatch(formFile, /puntualidad WhatsApp/i);
    assert.doesNotMatch(formFile, /salida anticipada WhatsApp/i);
  });
});
