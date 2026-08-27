import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createCompanyUserSchema,
  updateCompanyUserSchema,
} from "../schemas/company-user.schema";

describe("company user schemas", () => {
  it("accepts invite payload without temporary password", () => {
    const parsed = createCompanyUserSchema.safeParse({
      name: "Nuevo Usuario",
      email: "nuevo@example.com",
      role: "ADMIN",
    });
    assert.equal(parsed.success, true);
  });

  it("rejects temporaryPassword as unknown under strict schema", () => {
    const parsed = createCompanyUserSchema.safeParse({
      name: "Nuevo Usuario",
      email: "nuevo@example.com",
      role: "ADMIN",
      temporaryPassword: "secret123",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects ignored legacy status and isDefault fields", () => {
    const withStatus = createCompanyUserSchema.safeParse({
      name: "Nuevo Usuario",
      email: "nuevo@example.com",
      role: "ADMIN",
      status: "INACTIVE",
    });
    const withDefault = createCompanyUserSchema.safeParse({
      name: "Nuevo Usuario",
      email: "nuevo@example.com",
      role: "ADMIN",
      isDefault: true,
    });
    assert.equal(withStatus.success, false);
    assert.equal(withDefault.success, false);
  });

  it("rejects invalid role", () => {
    const parsed = createCompanyUserSchema.safeParse({
      name: "Nuevo Usuario",
      email: "nuevo@example.com",
      role: "SUPERADMIN",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects empty update payload", () => {
    const parsed = updateCompanyUserSchema.safeParse({});
    assert.equal(parsed.success, false);
  });

  it("accepts phone-only update and clearing phone", () => {
    const withPhone = updateCompanyUserSchema.safeParse({ phoneNumber: "+5491112345678" });
    const clearPhone = updateCompanyUserSchema.safeParse({ phoneNumber: null });
    assert.equal(withPhone.success, true);
    assert.equal(clearPhone.success, true);
  });
});
