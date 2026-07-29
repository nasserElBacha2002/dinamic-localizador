import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_COMPANY_OPERATIONAL_DEFAULTS } from "../../constants/company-operational-defaults";
import {
  toCompanySettingsFormValues,
  validateCompanySettingsFields,
} from "../../utils/company-settings-validation";
import {
  getFirstCreatePlatformCompanyErrorField,
  isCreateCompanyValidationValid,
  validateCreatePlatformCompanyForm,
} from "./create-platform-company-form";

const validState = () => ({
  name: "Dinamic SA",
  settings: toCompanySettingsFormValues(DEFAULT_COMPANY_OPERATIONAL_DEFAULTS),
  modules: ["attendance" as const, "operations" as const],
  ownerName: "Owner",
  ownerEmail: "owner@example.com",
  ownerTemporaryPassword: "password1",
});

describe("validateCreatePlatformCompanyForm", () => {
  it("accepts overnight default schedule 20:30–03:00", () => {
    const state = validState();
    assert.equal(state.settings.defaultOperationStartTime, "20:30");
    assert.equal(state.settings.defaultOperationEndTime, "03:00");
    const result = validateCreatePlatformCompanyForm(state);
    assert.deepEqual(result.fieldErrors, {});
    assert.deepEqual(result.formErrors, []);
    assert.equal(isCreateCompanyValidationValid(result), true);
  });

  it("flags missing company name and owner fields", () => {
    const result = validateCreatePlatformCompanyForm({
      ...validState(),
      name: " ",
      ownerName: "",
      ownerEmail: "",
      ownerTemporaryPassword: "short",
    });
    assert.ok(result.fieldErrors.name);
    assert.ok(result.fieldErrors.ownerName);
    assert.ok(result.fieldErrors.ownerEmail);
    assert.ok(result.fieldErrors.ownerTemporaryPassword);
    assert.equal(getFirstCreatePlatformCompanyErrorField(result), "name");
    assert.equal(isCreateCompanyValidationValid(result), false);
  });

  it("flags invalid email and empty modules", () => {
    const result = validateCreatePlatformCompanyForm({
      ...validState(),
      ownerEmail: "not-an-email",
      modules: [],
    });
    assert.match(result.fieldErrors.ownerEmail ?? "", /no es válido/);
    assert.ok(result.fieldErrors.modules);
  });

  it("maps radius errors to a typed field key without message parsing", () => {
    const state = validState();
    state.settings.defaultRadiusMeters = "5";
    const settingsErrors = validateCompanySettingsFields(state.settings);
    assert.ok(settingsErrors.defaultRadiusMeters);
    const result = validateCreatePlatformCompanyForm(state);
    assert.equal(result.fieldErrors.defaultRadiusMeters, settingsErrors.defaultRadiusMeters);
    assert.equal(result.formErrors.length, 0);
  });

  it("blocks submit when a non-visible settings field is invalid", () => {
    const state = validState();
    state.settings.pendingOperationExpirationHours = "0";
    state.settings.geofenceReviewMarginMeters = "9999";
    const result = validateCreatePlatformCompanyForm(state);
    assert.equal(Object.keys(result.fieldErrors).includes("pendingOperationExpirationHours"), false);
    assert.ok(result.formErrors.length >= 1);
    assert.equal(isCreateCompanyValidationValid(result), false);
    assert.equal(getFirstCreatePlatformCompanyErrorField(result), null);
  });

  it("accepts zero WhatsApp tolerances", () => {
    const state = validState();
    state.settings.lateGraceMinutes = "0";
    state.settings.earlyLeaveToleranceMinutes = "0";
    const result = validateCreatePlatformCompanyForm(state);
    assert.equal(isCreateCompanyValidationValid(result), true);
  });

  it("rejects invalid HH:mm schedule formats", () => {
    const state = validState();
    state.settings.defaultOperationStartTime = "25:00";
    const result = validateCreatePlatformCompanyForm(state);
    assert.ok(result.fieldErrors.defaultOperationStartTime);
  });
});

describe("validateCompanySettingsFields", () => {
  it("returns typed keys for each invalid rule", () => {
    const values = toCompanySettingsFormValues(DEFAULT_COMPANY_OPERATIONAL_DEFAULTS);
    values.operationTimezone = "";
    values.defaultRadiusMeters = "1";
    values.defaultOperationStartTime = "bad";
    values.lateGraceMinutes = "999";
    values.pendingOperationExpirationHours = "0";

    const errors = validateCompanySettingsFields(values);
    assert.ok(errors.operationTimezone);
    assert.ok(errors.defaultRadiusMeters);
    assert.ok(errors.defaultOperationStartTime);
    assert.ok(errors.lateGraceMinutes);
    assert.ok(errors.pendingOperationExpirationHours);
  });
});
