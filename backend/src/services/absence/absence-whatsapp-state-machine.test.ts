import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildConfirmationFingerprint,
  normalizeAbsenceCommand,
  transitionAbsenceWhatsapp,
} from "./absence-whatsapp-state-machine";

describe("absence-whatsapp-state-machine", () => {
  it("normalizes numbered menu and spanish commands", () => {
    assert.equal(normalizeAbsenceCommand("1"), "CREAR_AUSENCIA");
    assert.equal(normalizeAbsenceCommand("consultar saldo"), "CONSULTAR_SALDO");
    assert.equal(normalizeAbsenceCommand("CANCELAR"), "CANCELAR");
    assert.equal(normalizeAbsenceCommand("CONFIRMAR"), "CONFIRMAR");
  });

  it("transitions CREATE flow through summary", () => {
    let state = transitionAbsenceWhatsapp("IDLE", "INICIO")!.nextState;
    assert.equal(state, "SELECTING_ACTION");
    state = transitionAbsenceWhatsapp(state, "CREAR_AUSENCIA")!.nextState;
    assert.equal(state, "SELECTING_ABSENCE_TYPE");
    state = transitionAbsenceWhatsapp(state, "SELECT_OPTION")!.nextState;
    assert.equal(state, "ENTERING_START_DATE");
    state = transitionAbsenceWhatsapp(state, "SUBMIT_TEXT")!.nextState;
    assert.equal(state, "ENTERING_END_DATE");
    state = transitionAbsenceWhatsapp(state, "SUBMIT_TEXT")!.nextState;
    assert.equal(state, "ENTERING_REASON");
    state = transitionAbsenceWhatsapp(state, "SUBMIT_TEXT")!.nextState;
    assert.equal(state, "WAITING_ATTACHMENT");
    state = transitionAbsenceWhatsapp(state, "SUBMIT_ATTACHMENT")!.nextState;
    assert.equal(state, "REVIEWING_SUMMARY");
    const confirm = transitionAbsenceWhatsapp(state, "CONFIRMAR")!;
    assert.equal(confirm.nextState, "CONFIRMING_SUBMISSION");
    assert.equal(confirm.requireConfirmFingerprint, true);
  });

  it("CANCELAR terminates from mid-flow", () => {
    const t = transitionAbsenceWhatsapp("ENTERING_REASON", "CANCELAR")!;
    assert.equal(t.nextState, "CANCELLED");
    assert.equal(t.cancelSession, true);
  });

  it("EXPIRE marks expired", () => {
    const t = transitionAbsenceWhatsapp("WAITING_ATTACHMENT", "EXPIRE")!;
    assert.equal(t.nextState, "EXPIRED");
  });

  it("fingerprint changes when calendar version changes", () => {
    const a = buildConfirmationFingerprint({
      absenceTypeId: "t1",
      startDate: "2026-08-01",
      endDate: "2026-08-02",
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      calendarVersion: 1,
      balanceVersion: 1,
      attachmentPolicy: "OPTIONAL",
      inputHash: "abc",
    });
    const b = buildConfirmationFingerprint({
      absenceTypeId: "t1",
      startDate: "2026-08-01",
      endDate: "2026-08-02",
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      calendarVersion: 2,
      balanceVersion: 1,
      attachmentPolicy: "OPTIONAL",
      inputHash: "abc",
    });
    assert.notEqual(a, b);
  });
});
