import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("whatsapp check-in during approved absence", () => {
  const checkInFlow = readFileSync(
    resolve(process.cwd(), "src/services/bot/check-in-attendance.flow.ts"),
    "utf8",
  );
  const messages = readFileSync(
    resolve(process.cwd(), "src/services/bot/bot-response.builder.ts"),
    "utf8",
  );
  const availability = readFileSync(
    resolve(process.cwd(), "src/repositories/employee-workday-availability.repository.ts"),
    "utf8",
  );

  it("allows JUSTIFIED workdays as check-in candidates", () => {
    assert.match(availability, /expectation_status = 'JUSTIFIED'/);
    assert.match(availability, /absence_request_id IS NOT NULL/);
  });

  it("uses dedicated arrival-during-absence message", () => {
    assert.match(messages, /ARRIVAL_DURING_APPROVED_ABSENCE_MESSAGE/);
    assert.match(checkInFlow, /recordedDuringApprovedAbsence/);
    assert.match(checkInFlow, /ARRIVAL_DURING_APPROVED_ABSENCE_MESSAGE/);
  });
});
