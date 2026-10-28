import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectAbsenceTypeCode,
  isAbsenceIntent,
  isAffirmativeConfirmation,
} from "./absence-intent";

describe("isAbsenceIntent", () => {
  it("detects generic absence intents", () => {
    assert.equal(isAbsenceIntent("Quiero pedir vacaciones"), true);
    assert.equal(isAbsenceIntent("pedir ausencia el viernes"), true);
    assert.equal(isAbsenceIntent("Llegué"), false);
  });
});

describe("detectAbsenceTypeCode", () => {
  it("detects vacation and sick leave hints", () => {
    assert.equal(detectAbsenceTypeCode("quiero pedir vacaciones"), "VACATION");
    assert.equal(detectAbsenceTypeCode("no puedo ir por salud"), "SICK_LEAVE");
    assert.equal(detectAbsenceTypeCode("necesito dia de estudio"), "STUDY_DAY");
  });
});

describe("isAffirmativeConfirmation", () => {
  it("accepts common confirmations", () => {
    assert.equal(isAffirmativeConfirmation("si"), true);
    assert.equal(isAffirmativeConfirmation("Sí"), true);
    assert.equal(isAffirmativeConfirmation("no"), false);
  });
});
