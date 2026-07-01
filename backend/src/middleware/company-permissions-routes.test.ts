import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { requireAnyPermission, requirePermission } from "../middleware/company-context";
import { resolvePermissionsForRole } from "../constants/company-permissions";

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

describe("requirePermission middleware", () => {
  it("allows READ_ONLY to read employees but blocks manage", () => {
    const readOnlyPermissions = resolvePermissionsForRole("READ_ONLY");
    const req = { permissions: readOnlyPermissions } as Request;
    const res = createMockResponse();
    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
    };

    requirePermission("employees:read")(req, res, next);
    assert.equal(nextCalled, true);

    nextCalled = false;
    requirePermission("employees:manage")(req, res, next);
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });

  it("allows OWNER to mutate and SUPERADMIN-effective OWNER to manage users", () => {
    const ownerPermissions = resolvePermissionsForRole("OWNER");
    const req = { permissions: ownerPermissions } as Request;
    const res = createMockResponse();
    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
    };

    requirePermission("users:manage")(req, res, next);
    assert.equal(nextCalled, true);

    nextCalled = false;
    requirePermission("employees:manage")(req, res, next);
    assert.equal(nextCalled, true);
  });

  it("requireAnyPermission grants bot simulator read with inventories:read", () => {
    const operatorPermissions = resolvePermissionsForRole("OPERATOR");
    const req = { permissions: operatorPermissions } as Request;
    const res = createMockResponse();
    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
    };

    requireAnyPermission("attendance:read", "inventories:read")(req, res, next);
    assert.equal(nextCalled, true);
  });
});
