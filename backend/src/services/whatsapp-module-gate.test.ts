import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMPANY_MODULE_KEYS } from "../constants/company-modules";
import { MODULE_DISABLED_MESSAGE } from "./bot/bot-response.builder";
import {
  getAbsenceModuleBlockedMessage,
  getAttendanceModuleBlockedMessage,
  getCheckInModuleBlockedMessage,
  isModuleEnabledInStates,
} from "./whatsapp-module-gate";

const allEnabled = () =>
  new Map([
    [COMPANY_MODULE_KEYS.ATTENDANCE, true],
    [COMPANY_MODULE_KEYS.INVENTORY_OPERATIONS, true],
    [COMPANY_MODULE_KEYS.ABSENCES, true],
  ]);

describe("whatsappModuleGate", () => {
  it("reports enabled modules", () => {
    const states = allEnabled();
    assert.equal(isModuleEnabledInStates(states, COMPANY_MODULE_KEYS.ATTENDANCE), true);
    assert.equal(getAttendanceModuleBlockedMessage(states), null);
    assert.equal(getCheckInModuleBlockedMessage(states), null);
    assert.equal(getAbsenceModuleBlockedMessage(states), null);
  });

  it("blocks attendance when attendance module is disabled", () => {
    const states = allEnabled();
    states.set(COMPANY_MODULE_KEYS.ATTENDANCE, false);

    assert.equal(getAttendanceModuleBlockedMessage(states), MODULE_DISABLED_MESSAGE);
    assert.equal(getCheckInModuleBlockedMessage(states), MODULE_DISABLED_MESSAGE);
  });

  it("blocks check-in when inventory operations module is disabled", () => {
    const states = allEnabled();
    states.set(COMPANY_MODULE_KEYS.INVENTORY_OPERATIONS, false);

    assert.equal(getAttendanceModuleBlockedMessage(states), null);
    assert.equal(getCheckInModuleBlockedMessage(states), MODULE_DISABLED_MESSAGE);
  });

  it("blocks absence flow when absences module is disabled", () => {
    const states = allEnabled();
    states.set(COMPANY_MODULE_KEYS.ABSENCES, false);

    assert.equal(getAbsenceModuleBlockedMessage(states), MODULE_DISABLED_MESSAGE);
  });
});
