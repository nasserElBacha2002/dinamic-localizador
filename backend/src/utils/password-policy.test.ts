import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../errors/app-error";
import { assertPasswordPolicy, passwordSchema } from "./password-policy";

describe("password-policy", () => {
  it("accepts passwords that meet the shared policy", () => {
    assert.equal(passwordSchema.safeParse("secure-password").success, true);
    assert.doesNotThrow(() => assertPasswordPolicy("secure-password"));
  });

  it("rejects passwords that are too short", () => {
    assert.equal(passwordSchema.safeParse("short").success, false);
    assert.throws(
      () => assertPasswordPolicy("short"),
      (error: unknown) => error instanceof AppError && error.code === "PASSWORD_TOO_SHORT",
    );
  });

  it("rejects passwords that are too long", () => {
    const tooLong = "x".repeat(129);
    assert.equal(passwordSchema.safeParse(tooLong).success, false);
    assert.throws(
      () => assertPasswordPolicy(tooLong),
      (error: unknown) => error instanceof AppError && error.code === "PASSWORD_INVALID",
    );
  });
});
