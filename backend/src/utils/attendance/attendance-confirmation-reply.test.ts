import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAttendanceConfirmationReply } from "./attendance-confirmation-reply";

describe("parseAttendanceConfirmationReply", () => {
  it("detects affirmative contextual replies", () => {
    assert.equal(parseAttendanceConfirmationReply("Sí"), "affirmative");
    assert.equal(parseAttendanceConfirmationReply("si"), "affirmative");
    assert.equal(parseAttendanceConfirmationReply("confirmo"), "affirmative");
    assert.equal(parseAttendanceConfirmationReply("1"), "affirmative");
  });

  it("detects negative contextual replies", () => {
    assert.equal(parseAttendanceConfirmationReply("No"), "negative");
    assert.equal(parseAttendanceConfirmationReply("no puedo"), "negative");
    assert.equal(parseAttendanceConfirmationReply("2"), "negative");
  });

  it("returns unknown for ambiguous replies", () => {
    assert.equal(parseAttendanceConfirmationReply("hola"), "unknown");
    assert.equal(parseAttendanceConfirmationReply(""), "unknown");
  });
});
