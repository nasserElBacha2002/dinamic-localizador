import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMPANY_MODULE_KEYS } from "../../constants/company-modules";
import {
  buildAvailableMenuOptions,
  buildInvalidMenuSelectionMessage,
  INVALID_MENU_SELECTION_PREFIX,
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
  it("returns 8 options in expected order when all modules are enabled", () => {
    const options = buildAvailableMenuOptions(allEnabled());
    assert.equal(options.length, 8);
    assert.deepEqual(
      options.map((option) => option.key),
      [
        "check_in",
        "checkout",
        "absence",
        "workday",
        "upcoming_assignments",
        "confirm_attendance",
        "report_unavailability",
        "payroll_receipt",
      ],
    );
  });

  it("hides payroll_receipt when payroll_receipts module is disabled", () => {
    const states = allEnabled();
    states.set(COMPANY_MODULE_KEYS.PAYROLL_RECEIPTS, false);
    const options = buildAvailableMenuOptions(states);
    assert.equal(options.some((option) => option.key === "payroll_receipt"), false);
    assert.equal(options.length, 7);
  });

  it("removes absence and renumbers when absences is disabled", () => {
    const states = allEnabled();
    states.set(COMPANY_MODULE_KEYS.ABSENCES, false);
    const options = buildAvailableMenuOptions(states);
    assert.equal(options.length, 7);
    assert.deepEqual(options.map((option) => option.key), [
      "check_in",
      "checkout",
      "workday",
      "upcoming_assignments",
      "confirm_attendance",
      "report_unavailability",
      "payroll_receipt",
    ]);
    assert.equal(resolveMenuNumberSelection("3", states), "workday");
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
      "report_unavailability",
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
    assert.equal(resolveMenuNumberSelection("7", states), "report_unavailability");
    assert.equal(resolveMenuNumberSelection("8", states), "payroll_receipt");
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

describe("buildInvalidMenuSelectionMessage", () => {
  it("includes prefix and dynamic numbered options", () => {
    const message = buildInvalidMenuSelectionMessage(allEnabled());
    assert.match(message, new RegExp(INVALID_MENU_SELECTION_PREFIX));
    assert.match(message, /1\. Marcar llegada/);
    assert.match(message, /8\. Consultar recibo de sueldo/);
  });
});
