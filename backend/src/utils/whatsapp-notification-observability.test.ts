import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findDuplicateTwilioContentSids,
  warnOnDuplicateTwilioContentSids,
} from "./whatsapp-notification-observability";

describe("findDuplicateTwilioContentSids", () => {
  it("returns empty when all configured SIDs are distinct", () => {
    assert.deepEqual(
      findDuplicateTwilioContentSids({
        ARRIVAL: "HX_ARRIVAL",
        EXIT: "HX_EXIT",
        ATTENDANCE_CONFIRMATION: "HX_CONFIRM",
        EVENTUAL_ASSIGNMENT: "HX_ASSIGN",
      }),
      [],
    );
  });

  it("detects ARRIVAL == ATTENDANCE_CONFIRMATION", () => {
    const collisions = findDuplicateTwilioContentSids({
      ARRIVAL: "HX_SAME",
      ATTENDANCE_CONFIRMATION: "HX_SAME",
      EVENTUAL_ASSIGNMENT: "HX_OTHER",
    });
    assert.equal(collisions.length, 1);
    assert.equal(collisions[0]?.left, "ARRIVAL");
    assert.equal(collisions[0]?.right, "ATTENDANCE_CONFIRMATION");
    assert.equal(collisions[0]?.contentSid, "HX_SAME");
  });

  it("ignores empty SIDs", () => {
    assert.deepEqual(
      findDuplicateTwilioContentSids({
        ARRIVAL: "HX_A",
        EXIT: "",
        ATTENDANCE_CONFIRMATION: null,
        EVENTUAL_ASSIGNMENT: "HX_A",
      }),
      [
        {
          left: "ARRIVAL",
          right: "EVENTUAL_ASSIGNMENT",
          contentSid: "HX_A",
        },
      ],
    );
  });

  it("warnOnDuplicateTwilioContentSids returns collisions without throwing", () => {
    const collisions = warnOnDuplicateTwilioContentSids({
      ARRIVAL: "HX_DUP",
      EVENTUAL_ASSIGNMENT: "HX_DUP",
    });
    assert.equal(collisions.length, 1);
  });
});
