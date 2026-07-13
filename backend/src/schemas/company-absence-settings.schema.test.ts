import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { updateCompanyAbsenceSettingsSchema } from "./company-absence-settings.schema";

describe("updateCompanyAbsenceSettingsSchema", () => {
  it("rejects empty settings array", () => {
    const result = updateCompanyAbsenceSettingsSchema.safeParse({ settings: [] });
    assert.equal(result.success, false);
  });

  it("rejects negative default annual days", () => {
    const result = updateCompanyAbsenceSettingsSchema.safeParse({
      settings: [
        {
          absenceTypeCode: "VACATION",
          defaultAnnualDays: -1,
          autoAssignOnEmployeeCreate: true,
        },
      ],
    });
    assert.equal(result.success, false);
  });

  it("rejects duplicate absence type codes in one request", () => {
    const result = updateCompanyAbsenceSettingsSchema.safeParse({
      settings: [
        {
          absenceTypeCode: "VACATION",
          defaultAnnualDays: 14,
          autoAssignOnEmployeeCreate: true,
        },
        {
          absenceTypeCode: "vacation",
          defaultAnnualDays: 10,
          autoAssignOnEmployeeCreate: false,
        },
      ],
    });
    assert.equal(result.success, false);
  });

  it("accepts decimal default annual days", () => {
    const result = updateCompanyAbsenceSettingsSchema.safeParse({
      settings: [
        {
          absenceTypeCode: "STUDY_DAY",
          defaultAnnualDays: 2.5,
          autoAssignOnEmployeeCreate: true,
        },
      ],
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.settings[0]?.defaultAnnualDays, 2.5);
    }
  });

  it("requires absence type code", () => {
    const result = updateCompanyAbsenceSettingsSchema.safeParse({
      settings: [
        {
          absenceTypeCode: "",
          defaultAnnualDays: 0,
          autoAssignOnEmployeeCreate: false,
        },
      ],
    });
    assert.equal(result.success, false);
  });
});
