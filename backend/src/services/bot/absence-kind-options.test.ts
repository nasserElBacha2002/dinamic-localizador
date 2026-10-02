import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMPANY_MODULE_KEYS } from "../../constants/company-modules";
import {
  buildAbsenceKindSelectionPrompt,
  buildAvailableAbsenceKindOptions,
  resolveAbsenceKindSelection,
} from "./absence-kind-options";

const allEnabled = () =>
  new Map([
    [COMPANY_MODULE_KEYS.ATTENDANCE, true],
    [COMPANY_MODULE_KEYS.OPERATIONS, true],
    [COMPANY_MODULE_KEYS.ABSENCES, true],
    [COMPANY_MODULE_KEYS.PAYROLL_RECEIPTS, true],
  ]);

describe("buildAvailableAbsenceKindOptions", () => {
  it("includes workday, absence and vacation when both modules are enabled", () => {
    assert.deepEqual(
      buildAvailableAbsenceKindOptions(allEnabled()).map((option) => option.key),
      ["single_workday", "absence", "vacation"],
    );
  });

  it("keeps only single_workday when absences is disabled", () => {
    const states = allEnabled();
    states.set(COMPANY_MODULE_KEYS.ABSENCES, false);
    assert.deepEqual(
      buildAvailableAbsenceKindOptions(states).map((option) => option.key),
      ["single_workday"],
    );
  });

  it("keeps absence and vacation when operations is disabled", () => {
    const states = allEnabled();
    states.set(COMPANY_MODULE_KEYS.OPERATIONS, false);
    assert.deepEqual(
      buildAvailableAbsenceKindOptions(states).map((option) => option.key),
      ["absence", "vacation"],
    );
  });
});

describe("resolveAbsenceKindSelection", () => {
  it("resolves numbered options from the snapshot", () => {
    const keys = ["single_workday", "absence", "vacation"] as const;
    assert.equal(resolveAbsenceKindSelection("1", keys), "single_workday");
    assert.equal(resolveAbsenceKindSelection("2", keys), "absence");
    assert.equal(resolveAbsenceKindSelection("3", keys), "vacation");
    assert.equal(resolveAbsenceKindSelection("4", keys), null);
  });
});

describe("buildAbsenceKindSelectionPrompt", () => {
  it("lists numbered kind options", () => {
    const message = buildAbsenceKindSelectionPrompt(buildAvailableAbsenceKindOptions(allEnabled()));
    assert.match(message, /1\. No voy a una jornada/);
    assert.match(message, /2\. Informar una ausencia/);
    assert.match(message, /3\. Solicitar vacaciones/);
  });
});
