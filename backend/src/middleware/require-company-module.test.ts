import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { ALL_COMPANY_MODULE_KEYS } from "../constants/company-modules";
import {
  requireAnyCompanyModule,
  requireCompanyModule,
} from "../middleware/require-company-module";

const createMockResponse = () => {
  const response: Partial<Response> & { statusCode?: number; body?: unknown } = {};
  response.status = (code: number) => {
    response.statusCode = code;
    return response as Response;
  };
  response.json = (body: unknown) => {
    response.body = body;
    return response as Response;
  };
  return response as Response & { statusCode?: number; body?: unknown };
};

const enabledStates = new Map(
  ALL_COMPANY_MODULE_KEYS.map((moduleKey) => [moduleKey, moduleKey !== "absences"]),
);

describe("requireCompanyModule middleware", () => {
  it("allows route when module is enabled", () => {
    const req = { companyModuleStates: enabledStates } as Request;
    const res = createMockResponse();
    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
    };

    requireCompanyModule("attendance")(req, res, next);
    assert.equal(nextCalled, true);
  });

  it("rejects route with MODULE_DISABLED when module is disabled", () => {
    const req = { companyModuleStates: enabledStates } as Request;
    const res = createMockResponse();
    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
    };

    requireCompanyModule("absences")(req, res, next);
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal((res.body as { error?: { code?: string } }).error?.code, "MODULE_DISABLED");
  });
});

describe("requireAnyCompanyModule middleware", () => {
  it("allows employees route when any dependent module is enabled", () => {
    const onlyAttendance = new Map(
      ALL_COMPANY_MODULE_KEYS.map((moduleKey) => [moduleKey, moduleKey === "attendance"]),
    );
    const req = { companyModuleStates: onlyAttendance } as Request;
    const res = createMockResponse();
    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
    };

    requireAnyCompanyModule("attendance", "inventory_operations", "absences")(req, res, next);
    assert.equal(nextCalled, true);
  });

  it("rejects when all dependent modules are disabled", () => {
    const disabledCore = new Map(
      ALL_COMPANY_MODULE_KEYS.map((moduleKey) => [
        moduleKey,
        !["attendance", "inventory_operations", "absences"].includes(moduleKey),
      ]),
    );
    const req = { companyModuleStates: disabledCore } as Request;
    const res = createMockResponse();
    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
    };

    requireAnyCompanyModule("attendance", "inventory_operations", "absences")(req, res, next);
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal((res.body as { error?: { code?: string } }).error?.code, "MODULE_DISABLED");
  });
});
