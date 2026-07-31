import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseRepairOneTimeScheduleCliArgs,
  resolveRepairCliExitCode,
} from "../../scripts/repair-one-time-schedule-drift";

describe("repair-one-time-schedule-drift CLI", () => {
  it("defaults to dry-run and requires scope", () => {
    assert.throws(() => parseRepairOneTimeScheduleCliArgs([]), /Scope required/);
    const args = parseRepairOneTimeScheduleCliArgs([
      "--companyId",
      "59D5FF94-6614-419A-9C9D-485383CDE043",
    ]);
    assert.equal(args.apply, false);
    assert.equal(args.companyId, "59D5FF94-6614-419A-9C9D-485383CDE043");
  });

  it("parses apply and operationIds", () => {
    const args = parseRepairOneTimeScheduleCliArgs([
      "--companyId",
      "59D5FF94-6614-419A-9C9D-485383CDE043",
      "--operationIds",
      "C75CF9A2-A84A-4C52-B1F8-9DBFAC6DD1AE,aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "--apply",
    ]);
    assert.equal(args.apply, true);
    assert.equal(args.operationIds.length, 2);
  });

  it("maps exit codes from summary", () => {
    assert.equal(
      resolveRepairCliExitCode(
        {
          scanned: 1,
          consistent: 1,
          repairable: 0,
          repaired: 0,
          blocked: 0,
          failed: 0,
          skipped: 0,
        },
        false,
      ),
      0,
    );
    assert.equal(
      resolveRepairCliExitCode(
        {
          scanned: 2,
          consistent: 0,
          repairable: 0,
          repaired: 0,
          blocked: 0,
          failed: 1,
          skipped: 0,
        },
        true,
      ),
      1,
    );
    assert.equal(
      resolveRepairCliExitCode(
        {
          scanned: 2,
          consistent: 0,
          repairable: 0,
          repaired: 0,
          blocked: 1,
          failed: 0,
          skipped: 0,
        },
        true,
      ),
      2,
    );
  });
});
