import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("attendance checkout identity", () => {
  it("resolves checkout through employee_workday_id", () => {
    const repositorySource = readFileSync(
      join(process.cwd(), "src/repositories/attendance.repository.ts"),
      "utf8",
    );
    const botSource = readFileSync(join(process.cwd(), "src/services/whatsapp-bot.service.ts"), "utf8");

    assert.match(repositorySource, /findCheckInForEmployeeWorkday/);
    assert.match(repositorySource, /employee_workday_id = @employeeWorkdayId/);
    assert.match(botSource, /findCheckInForEmployeeWorkday/);
    assert.match(botSource, /ensureEmployeeWorkday/);
  });
});
