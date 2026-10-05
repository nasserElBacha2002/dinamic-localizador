import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMPANY_MODULE_KEYS } from "../../constants/company-modules";
import {
  buildAvailableMenuOptions,
  buildInvalidMenuSelectionMessage,
  INVALID_MENU_SELECTION_PREFIX,
  isLegacyMenuSnapshotOptionKey,
  isMenuSnapshotOptionSupported,
  resolveMenuNumberSelection,
} from "./bot-menu-options";

const allEnabled = () =>
  new Map([
    [COMPANY_MODULE_KEYS.ATTENDANCE, true],
    [COMPANY_MODULE_KEYS.OPERATIONS, true],
    [COMPANY_MODULE_KEYS.ABSENCES, true],
    [COMPANY_MODULE_KEYS.PAYROLL_RECEIPTS, true],
  ]);

describe("buildAvailableMenuOptions", () => {
  it("returns 7 options in expected order when all modules are enabled", () => {
    const options = buildAvailableMenuOptions(allEnabled());
    assert.equal(options.length, 7);
    assert.deepEqual(
      options.map((option) => option.key),
      [
        "check_in",
        "checkout",
        "absence",
        "workday",
        "upcoming_assignments",
        "confirm_attendance",
        "payroll_receipt",
      ],
    );
    assert.equal(options.some((option) => option.key === "report_unavailability"), false);
  });

  it("hides payroll_receipt when payroll_receipts module is disabled", () => {
    const states = allEnabled();
    states.set(COMPANY_MODULE_KEYS.PAYROLL_RECEIPTS, false);
    const options = buildAvailableMenuOptions(states);
    assert.equal(options.some((option) => option.key === "payroll_receipt"), false);
    assert.equal(options.length, 6);
  });

  it("keeps unified absence entry when absences is disabled but operations is enabled", () => {
    const states = allEnabled();
    states.set(COMPANY_MODULE_KEYS.ABSENCES, false);
    const options = buildAvailableMenuOptions(states);
    assert.deepEqual(options.map((option) => option.key), [
      "check_in",
      "checkout",
      "absence",
      "workday",
      "upcoming_assignments",
      "confirm_attendance",
      "payroll_receipt",
    ]);
    assert.equal(options.some((option) => option.key === "report_unavailability"), false);
    assert.equal(resolveMenuNumberSelection("3", states), "absence");
    assert.equal(resolveMenuNumberSelection("4", states), "workday");
  });

  it("removes operation-dependent options when operations is disabled", () => {
    const states = allEnabled();
    states.set(COMPANY_MODULE_KEYS.OPERATIONS, false);
    const options = buildAvailableMenuOptions(states);
    assert.deepEqual(options.map((option) => option.key), [
      "checkout",
      "absence",
      "payroll_receipt",
    ]);
    assert.equal(resolveMenuNumberSelection("1", states), "checkout");
    assert.equal(resolveMenuNumberSelection("2", states), "absence");
  });

  it("removes attendance-dependent options when attendance is disabled", () => {
    const states = allEnabled();
    states.set(COMPANY_MODULE_KEYS.ATTENDANCE, false);
    const options = buildAvailableMenuOptions(states);
    assert.deepEqual(options.map((option) => option.key), [
      "absence",
      "upcoming_assignments",
      "confirm_attendance",
      "payroll_receipt",
    ]);
    assert.equal(resolveMenuNumberSelection("1", states), "absence");
  });

  it("returns empty options when all employee-facing modules are disabled", () => {
    const states = allEnabled();
    states.set(COMPANY_MODULE_KEYS.ATTENDANCE, false);
    states.set(COMPANY_MODULE_KEYS.OPERATIONS, false);
    states.set(COMPANY_MODULE_KEYS.ABSENCES, false);
    states.set(COMPANY_MODULE_KEYS.PAYROLL_RECEIPTS, false);
    assert.equal(buildAvailableMenuOptions(states).length, 0);
  });
});

describe("resolveMenuNumberSelection", () => {
  it("resolves all menu numbers when every module is enabled", () => {
    const states = allEnabled();
    assert.equal(resolveMenuNumberSelection("1", states), "check_in");
    assert.equal(resolveMenuNumberSelection("01", states), "check_in");
    assert.equal(resolveMenuNumberSelection("2", states), "checkout");
    assert.equal(resolveMenuNumberSelection("3", states), "absence");
    assert.equal(resolveMenuNumberSelection("4", states), "workday");
    assert.equal(resolveMenuNumberSelection("5", states), "upcoming_assignments");
    assert.equal(resolveMenuNumberSelection("6", states), "confirm_attendance");
    assert.equal(resolveMenuNumberSelection("7", states), "payroll_receipt");
    assert.equal(resolveMenuNumberSelection("8", states), null);
  });

  it("returns null for non-numeric input", () => {
    assert.equal(resolveMenuNumberSelection("Llegué", allEnabled()), null);
    assert.equal(resolveMenuNumberSelection("confirmar 1", allEnabled()), null);
  });

  it("returns null for out-of-range numeric input", () => {
    assert.equal(resolveMenuNumberSelection("9", allEnabled()), null);
    assert.equal(resolveMenuNumberSelection("0", allEnabled()), null);
  });
});

describe("legacy menu snapshot compatibility", () => {
  it("treats report_unavailability as supported when operations module allows it", () => {
    const states = allEnabled();
    const allowed = new Set(buildAvailableMenuOptions(states).map((option) => option.key));
    assert.equal(isLegacyMenuSnapshotOptionKey("report_unavailability", states), true);
    assert.equal(
      isMenuSnapshotOptionSupported("report_unavailability", allowed, states),
      true,
    );
    assert.equal(allowed.has("report_unavailability"), false);
  });

  it("does not treat report_unavailability as supported when operations is disabled", () => {
    const states = allEnabled();
    states.set(COMPANY_MODULE_KEYS.OPERATIONS, false);
    const allowed = new Set(buildAvailableMenuOptions(states).map((option) => option.key));
    assert.equal(isLegacyMenuSnapshotOptionKey("report_unavailability", states), false);
    assert.equal(
      isMenuSnapshotOptionSupported("report_unavailability", allowed, states),
      false,
    );
  });
});

describe("buildInvalidMenuSelectionMessage", () => {
  it("includes prefix and dynamic numbered options", () => {
    const message = buildInvalidMenuSelectionMessage(
      buildAvailableMenuOptions(allEnabled()).map((option) => option.key),
    );
    assert.match(message, new RegExp(INVALID_MENU_SELECTION_PREFIX));
    assert.match(message, /1\. Marcar llegada/);
    assert.match(message, /7\. Consultar recibo de sueldo/);
  });
});
