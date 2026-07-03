import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CompanySettingsFormValues } from "../types/company-settings";
import { validateCompanySettingsForm } from "./company-settings-validation";

const validForm = (): CompanySettingsFormValues => ({
  operationTimezone: "America/Argentina/Buenos_Aires",
  defaultRadiusMeters: "150",
  defaultOperationStartTime: "20:30",
  defaultOperationEndTime: "03:00",
  defaultEarlyArrivalToleranceMinutes: "60",
  defaultLateArrivalToleranceMinutes: "90",
  lateGraceMinutes: "15",
  earlyLeaveToleranceMinutes: "15",
  requireCheckoutLocation: true,
  allowManualAttendanceCorrections: true,
});

describe("validateCompanySettingsForm", () => {
  it("returns no errors for a fully valid form", () => {
    assert.deepEqual(validateCompanySettingsForm(validForm()), []);
  });

  it("requires operationTimezone", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      operationTimezone: "   ",
    });
    assert.ok(errors.some((error) => error.includes("obligatoria")));
  });

  it("rejects invalid timezone", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      operationTimezone: "Not/A_Timezone",
    });
    assert.ok(errors.some((error) => error.includes("no es válida")));
  });

  it("accepts valid timezone", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      operationTimezone: "Europe/Madrid",
    });
    assert.equal(errors.some((error) => error.includes("zona horaria")), false);
  });

  it("rejects empty radius", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      defaultRadiusMeters: "",
    });
    assert.ok(errors.some((error) => error.includes("radio predeterminado")));
  });

  it("rejects non-numeric radius", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      defaultRadiusMeters: "abc",
    });
    assert.ok(errors.some((error) => error.includes("radio predeterminado")));
  });

  it("rejects radius below 10", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      defaultRadiusMeters: "9",
    });
    assert.ok(errors.some((error) => error.includes("radio predeterminado")));
  });

  it("rejects radius above 5000", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      defaultRadiusMeters: "5001",
    });
    assert.ok(errors.some((error) => error.includes("radio predeterminado")));
  });

  it("accepts valid radius", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      defaultRadiusMeters: "5000",
    });
    assert.equal(errors.some((error) => error.includes("radio predeterminado")), false);
  });

  it("rejects invalid default operation start time", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      defaultOperationStartTime: "25:00",
    });
    assert.ok(errors.some((error) => error.includes("horario de inicio por defecto")));
  });

  it("accepts empty default operation times", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      defaultOperationStartTime: "",
      defaultOperationEndTime: "",
    });
    assert.equal(errors.some((error) => error.includes("horario de")), false);
  });

  it("rejects empty defaultEarlyArrivalToleranceMinutes", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      defaultEarlyArrivalToleranceMinutes: "",
    });
    assert.ok(errors.some((error) => error.includes("llegada temprana para operaciones")));
  });

  it("rejects empty defaultLateArrivalToleranceMinutes", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      defaultLateArrivalToleranceMinutes: "",
    });
    assert.ok(errors.some((error) => error.includes("llegada tardía para operaciones")));
  });

  it("rejects empty lateGraceMinutes", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      lateGraceMinutes: "",
    });
    assert.ok(errors.some((error) => error.includes("puntualidad WhatsApp")));
  });

  it("rejects non-numeric lateGraceMinutes", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      lateGraceMinutes: "abc",
    });
    assert.ok(errors.some((error) => error.includes("puntualidad WhatsApp")));
  });

  it("rejects lateGraceMinutes below 0", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      lateGraceMinutes: "-1",
    });
    assert.ok(errors.some((error) => error.includes("puntualidad WhatsApp")));
  });

  it("rejects lateGraceMinutes above 240", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      lateGraceMinutes: "241",
    });
    assert.ok(errors.some((error) => error.includes("puntualidad WhatsApp")));
  });

  it("accepts valid lateGraceMinutes", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      lateGraceMinutes: "240",
    });
    assert.equal(errors.some((error) => error.includes("puntualidad WhatsApp")), false);
  });

  it("rejects empty earlyLeaveToleranceMinutes", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      earlyLeaveToleranceMinutes: "",
    });
    assert.ok(errors.some((error) => error.includes("salida anticipada WhatsApp")));
  });

  it("rejects non-numeric earlyLeaveToleranceMinutes", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      earlyLeaveToleranceMinutes: "abc",
    });
    assert.ok(errors.some((error) => error.includes("salida anticipada WhatsApp")));
  });

  it("rejects earlyLeaveToleranceMinutes below 0", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      earlyLeaveToleranceMinutes: "-1",
    });
    assert.ok(errors.some((error) => error.includes("salida anticipada WhatsApp")));
  });

  it("rejects earlyLeaveToleranceMinutes above 240", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      earlyLeaveToleranceMinutes: "241",
    });
    assert.ok(errors.some((error) => error.includes("salida anticipada WhatsApp")));
  });

  it("accepts valid earlyLeaveToleranceMinutes", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      earlyLeaveToleranceMinutes: "0",
    });
    assert.equal(errors.some((error) => error.includes("salida anticipada WhatsApp")), false);
  });
});
