import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../errors/app-error";
import {
  absenceEmployeeLockResource,
  acquireTransactionAppLockWithRequest,
  APP_LOCK_SQL,
  interpretAppLockResult,
  type SqlAppLockRequest,
} from "./sql-app-lock";

describe("sql-app-lock helpers", () => {
  it("builds a deterministic lowercase absence lock resource", () => {
    const companyId = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA";
    const employeeId = "BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB";
    assert.equal(
      absenceEmployeeLockResource(companyId, employeeId),
      "absence:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    );
  });

  it("APP_LOCK_SQL uses Exclusive + Transaction owner", () => {
    assert.match(APP_LOCK_SQL, /@LockMode = N'Exclusive'/);
    assert.match(APP_LOCK_SQL, /@LockOwner = N'Transaction'/);
    assert.match(APP_LOCK_SQL, /@LockTimeout = @lockTimeout/);
  });

  it("interpretAppLockResult: 0 and 1 succeed", () => {
    assert.doesNotThrow(() => interpretAppLockResult(0));
    assert.doesNotThrow(() => interpretAppLockResult(1));
  });

  it("interpretAppLockResult: -1 maps to timeout (custom or default)", () => {
    const custom = new AppError(409, "ABSENCE_LOCK_TIMEOUT", "busy");
    try {
      interpretAppLockResult(-1, custom);
      assert.fail("expected throw");
    } catch (error) {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "ABSENCE_LOCK_TIMEOUT");
      assert.equal(error.statusCode, 409);
    }

    try {
      interpretAppLockResult(-1);
      assert.fail("expected throw");
    } catch (error) {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "APP_LOCK_TIMEOUT");
      assert.equal(error.statusCode, 409);
    }
  });

  it("interpretAppLockResult: -2 maps to APP_LOCK_CANCELLED", () => {
    try {
      interpretAppLockResult(-2);
      assert.fail("expected throw");
    } catch (error) {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "APP_LOCK_CANCELLED");
      assert.equal(error.statusCode, 409);
    }
  });

  it("interpretAppLockResult: -3 maps to APP_LOCK_DEADLOCK (not timeout)", () => {
    try {
      interpretAppLockResult(-3);
      assert.fail("expected throw");
    } catch (error) {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "APP_LOCK_DEADLOCK");
      assert.equal(error.statusCode, 409);
      assert.notEqual(error.code, "APP_LOCK_TIMEOUT");
    }
  });

  it("interpretAppLockResult: unexpected negative maps to APP_LOCK_ERROR 500", () => {
    try {
      interpretAppLockResult(-999);
      assert.fail("expected throw");
    } catch (error) {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "APP_LOCK_ERROR");
      assert.equal(error.statusCode, 500);
    }
  });

  it("acquireTransactionAppLockWithRequest configures inputs and succeeds on 0", async () => {
    const inputs: Array<{ name: string; value: unknown }> = [];
    let capturedSql = "";

    const request: SqlAppLockRequest = {
      input(name, _type, value) {
        inputs.push({ name, value });
        return request;
      },
      async query(q) {
        capturedSql = q;
        return { recordset: [{ lockResult: 0 }] };
      },
    };

    await acquireTransactionAppLockWithRequest(request, {
      resource: "absence:c:e",
      lockTimeoutMs: 12000,
    });

    assert.deepEqual(inputs, [
      { name: "resource", value: "absence:c:e" },
      { name: "lockTimeout", value: 12000 },
    ]);
    assert.match(capturedSql, /@LockMode = N'Exclusive'/);
    assert.match(capturedSql, /@LockOwner = N'Transaction'/);
  });

  it("acquireTransactionAppLockWithRequest maps -1 via timeoutError", async () => {
    const request: SqlAppLockRequest = {
      input() {
        return request;
      },
      async query() {
        return { recordset: [{ lockResult: -1 }] };
      },
    };

    await assert.rejects(
      () =>
        acquireTransactionAppLockWithRequest(request, {
          resource: "r",
          timeoutError: new AppError(409, "ABSENCE_LOCK_TIMEOUT", "busy"),
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "ABSENCE_LOCK_TIMEOUT",
    );
  });
});
