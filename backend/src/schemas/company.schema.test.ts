import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { updateCompanySettingsSchema } from "./company.schema";

describe("updateCompanySettingsSchema", () => {
  it("rejects empty PATCH body", () => {
    const result = updateCompanySettingsSchema.safeParse({});
    assert.equal(result.success, false);
  });

  it("rejects invalid timezone", () => {
    const result = updateCompanySettingsSchema.safeParse({
      operationTimezone: "Not/A_Timezone",
    });
    assert.equal(result.success, false);
  });

  it("rejects radius <= 0", () => {
    const result = updateCompanySettingsSchema.safeParse({
      defaultRadiusMeters: 0,
    });
    assert.equal(result.success, false);
  });

  it("rejects radius above max", () => {
    const result = updateCompanySettingsSchema.safeParse({
      defaultRadiusMeters: 5001,
    });
    assert.equal(result.success, false);
  });

  it("rejects negative late grace minutes", () => {
    const result = updateCompanySettingsSchema.safeParse({
      lateGraceMinutes: -1,
    });
    assert.equal(result.success, false);
  });

  it("rejects negative early leave tolerance", () => {
    const result = updateCompanySettingsSchema.safeParse({
      earlyLeaveToleranceMinutes: -5,
    });
    assert.equal(result.success, false);
  });

  it("accepts valid partial update", () => {
    const result = updateCompanySettingsSchema.safeParse({
      defaultRadiusMeters: 200,
      lateGraceMinutes: 10,
    });
    assert.equal(result.success, true);
  });
});
