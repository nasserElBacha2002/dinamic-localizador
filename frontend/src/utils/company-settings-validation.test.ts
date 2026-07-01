import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CompanySettingsFormValues } from "../types/company-settings";
import { validateCompanySettingsForm } from "./company-settings-validation";

const validForm = (): CompanySettingsFormValues => ({
  operationTimezone: "America/Argentina/Buenos_Aires",
  defaultRadiusMeters: "150",
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

  it("rejects empty lateGraceMinutes", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      lateGraceMinutes: "",
    });
    assert.ok(errors.some((error) => error.includes("tolerancia de llegada")));
  });

  it("rejects non-numeric lateGraceMinutes", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      lateGraceMinutes: "abc",
    });
    assert.ok(errors.some((error) => error.includes("tolerancia de llegada")));
  });

  it("rejects lateGraceMinutes below 0", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      lateGraceMinutes: "-1",
    });
    assert.ok(errors.some((error) => error.includes("tolerancia de llegada")));
  });

  it("rejects lateGraceMinutes above 240", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      lateGraceMinutes: "241",
    });
    assert.ok(errors.some((error) => error.includes("tolerancia de llegada")));
  });

  it("accepts valid lateGraceMinutes", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      lateGraceMinutes: "240",
    });
    assert.equal(errors.some((error) => error.includes("tolerancia de llegada")), false);
  });

  it("rejects empty earlyLeaveToleranceMinutes", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      earlyLeaveToleranceMinutes: "",
    });
    assert.ok(errors.some((error) => error.includes("salida anticipada")));
  });

  it("rejects non-numeric earlyLeaveToleranceMinutes", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      earlyLeaveToleranceMinutes: "abc",
    });
    assert.ok(errors.some((error) => error.includes("salida anticipada")));
  });

  it("rejects earlyLeaveToleranceMinutes below 0", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      earlyLeaveToleranceMinutes: "-1",
    });
    assert.ok(errors.some((error) => error.includes("salida anticipada")));
  });

  it("rejects earlyLeaveToleranceMinutes above 240", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      earlyLeaveToleranceMinutes: "241",
    });
    assert.ok(errors.some((error) => error.includes("salida anticipada")));
  });

  it("accepts valid earlyLeaveToleranceMinutes", () => {
    const errors = validateCompanySettingsForm({
      ...validForm(),
      earlyLeaveToleranceMinutes: "0",
    });
    assert.equal(errors.some((error) => error.includes("salida anticipada")), false);
  });
});
