import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createCompanyUserSchema,
  updateCompanyUserSchema,
} from "../schemas/company-user.schema";

describe("company user schemas", () => {
  it("requires temporary password fields only at API layer for new users", () => {
    const parsed = createCompanyUserSchema.safeParse({
      name: "Nuevo Usuario",
      email: "nuevo@example.com",
      role: "ADMIN",
      temporaryPassword: "temporal123",
    });
    assert.equal(parsed.success, true);
  });

  it("rejects invalid role", () => {
    const parsed = createCompanyUserSchema.safeParse({
      name: "Nuevo Usuario",
      email: "nuevo@example.com",
      role: "SUPERADMIN",
      temporaryPassword: "temporal123",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects empty update payload", () => {
    const parsed = updateCompanyUserSchema.safeParse({});
    assert.equal(parsed.success, false);
  });
});
