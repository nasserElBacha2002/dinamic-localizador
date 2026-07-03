import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMPANY_MODULE_KEYS } from "../../constants/company-modules";
import { MODULE_DISABLED_MESSAGE } from "./bot-response.builder";
import {
  buildGreetingMessage,
  buildHelpMessage,
  buildNoActiveFlowCancelMessage,
  buildVolverMessage,
  NO_ACTIVE_FLOW_CANCEL_PREFIX,
  NO_WHATSAPP_OPTIONS_MESSAGE,
  VOLVER_ACTIVE_SESSION_MESSAGE,
} from "./bot-menu.builder";

const allEnabled = () =>
  new Map([
    [COMPANY_MODULE_KEYS.ATTENDANCE, true],
    [COMPANY_MODULE_KEYS.INVENTORY_OPERATIONS, true],
    [COMPANY_MODULE_KEYS.ABSENCES, true],
  ]);

describe("buildGreetingMessage", () => {
  it("shows command hints when modules are enabled", () => {
    const message = buildGreetingMessage(allEnabled());
    assert.match(message, /Marcar llegada — escribí "Llegué"/);
    assert.match(message, /Marcar salida — escribí "Me voy"/);
    assert.match(message, /Pedir ausencia o vacaciones — escribí "Pedir ausencia"/);
    assert.match(message, /Consultar jornada de hoy — escribí "Mi jornada" o "Hoy"/);
    assert.match(message, /Ver próximos turnos — escribí "Mis turnos" o "Agenda"/);
    assert.match(message, /Confirmar asistencia — escribí "Confirmo asistencia"/);
    assert.match(message, /Avisar no disponibilidad — escribí "No puedo asistir"/);
    assert.match(message, /Ayuda/);
    assert.match(message, /Cancelar/);
    assert.match(message, /número de la opción/);
  });

  it("notes active flow when requested in greeting", () => {
    const message = buildGreetingMessage(allEnabled(), { hasActiveSession: true });
    assert.match(message, /Tenés un flujo activo/);
    assert.match(message, /Cancelar/);
  });

  it("hides absence when absences is disabled", () => {
    const states = allEnabled();
    states.set(COMPANY_MODULE_KEYS.ABSENCES, false);
    const message = buildGreetingMessage(states);
    assert.doesNotMatch(message, /ausencia/i);
    assert.match(message, /Marcar llegada/);
  });

  it("hides workday when attendance or inventory_operations is disabled", () => {
    const states = allEnabled();
    states.set(COMPANY_MODULE_KEYS.ATTENDANCE, false);
    const message = buildGreetingMessage(states);
    assert.doesNotMatch(message, /jornada de hoy/i);
    assert.doesNotMatch(message, /Marcar llegada/);
  });

  it("hides upcoming assignments when inventory_operations is disabled", () => {
    const states = allEnabled();
    states.set(COMPANY_MODULE_KEYS.INVENTORY_OPERATIONS, false);
    const message = buildGreetingMessage(states);
    assert.doesNotMatch(message, /próximos turnos/i);
    assert.doesNotMatch(message, /jornada de hoy/i);
    assert.doesNotMatch(message, /Confirmar asistencia/i);
    assert.doesNotMatch(message, /Avisar no disponibilidad/i);
  });

  it("shows confirmation and unavailability when inventory_operations is enabled", () => {
    const message = buildGreetingMessage(allEnabled());
    assert.match(message, /Confirmar asistencia — escribí "Confirmo asistencia"/);
    assert.match(message, /Avisar no disponibilidad — escribí "No puedo asistir"/);
  });

  it("hides check-in when inventory_operations is disabled", () => {
    const states = allEnabled();
    states.set(COMPANY_MODULE_KEYS.INVENTORY_OPERATIONS, false);
    const message = buildGreetingMessage(states);
    assert.doesNotMatch(message, /Marcar llegada/);
    assert.match(message, /Marcar salida/);
  });

  it("hides check-in and checkout when attendance is disabled", () => {
    const states = allEnabled();
    states.set(COMPANY_MODULE_KEYS.ATTENDANCE, false);
    const message = buildGreetingMessage(states);
    assert.doesNotMatch(message, /Marcar llegada/);
    assert.doesNotMatch(message, /Marcar salida/);
    assert.match(message, /Pedir ausencia o vacaciones/);
  });

  it("returns a safe no-options message when all employee-facing modules are disabled", () => {
    const states = allEnabled();
    states.set(COMPANY_MODULE_KEYS.ATTENDANCE, false);
    states.set(COMPANY_MODULE_KEYS.INVENTORY_OPERATIONS, false);
    states.set(COMPANY_MODULE_KEYS.ABSENCES, false);
    const message = buildGreetingMessage(states);
    assert.equal(message, NO_WHATSAPP_OPTIONS_MESSAGE);
    assert.doesNotMatch(message, new RegExp(MODULE_DISABLED_MESSAGE));
  });
});

describe("buildHelpMessage", () => {
  it("includes help intro and dynamic menu", () => {
    const message = buildHelpMessage(allEnabled());
    assert.match(message, /Te puedo ayudar con las opciones habilitadas/);
    assert.match(message, /Marcar llegada — escribí "Llegué"/);
    assert.match(message, /Cancelar/);
    assert.match(message, /contactá a administración/i);
  });

  it("respects disabled modules", () => {
    const states = allEnabled();
    states.set(COMPANY_MODULE_KEYS.ABSENCES, false);
    const message = buildHelpMessage(states);
    assert.doesNotMatch(message, /ausencia/i);
    assert.match(message, /Marcar salida/);
  });

  it("notes active flow when requested", () => {
    const message = buildHelpMessage(allEnabled(), { hasActiveSession: true });
    assert.match(message, /Tenés un flujo activo/);
    assert.match(message, /Te puedo ayudar con las opciones habilitadas/);
  });
});

describe("buildNoActiveFlowCancelMessage", () => {
  it("returns friendly no-active-flow message plus menu", () => {
    const message = buildNoActiveFlowCancelMessage(allEnabled());
    assert.match(message, new RegExp(NO_ACTIVE_FLOW_CANCEL_PREFIX));
    assert.match(message, /Marcar llegada/);
  });
});

describe("buildVolverMessage", () => {
  it("returns safe unsupported-back message with active session", () => {
    assert.equal(buildVolverMessage(allEnabled(), true), VOLVER_ACTIVE_SESSION_MESSAGE);
  });

  it("returns menu without active session", () => {
    const message = buildVolverMessage(allEnabled(), false);
    assert.match(message, /Marcar llegada/);
  });
});
