import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAbsenceRequestAlertStatusLabel } from "./absence-request-alert-status";

describe("resolveAbsenceRequestAlertStatusLabel", () => {
  it("maps review states for WhatsApp copy", () => {
    assert.equal(resolveAbsenceRequestAlertStatusLabel("PENDING"), "Pendiente de revisión");
    assert.equal(resolveAbsenceRequestAlertStatusLabel("APPROVED"), "Aprobada");
    assert.equal(resolveAbsenceRequestAlertStatusLabel("NEEDS_INFO"), "Requiere información");
  });
});
