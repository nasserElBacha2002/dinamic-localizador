import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

describe("errorHandler security boundary", () => {
  it("does not leak stack, SQL, or filesystem paths to the client on unhandled errors", async () => {
    const { errorHandler } = await import("./error-handler");

    let statusCode = 0;
    let payload: unknown;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: unknown) {
        payload = body;
        return this;
      },
    } as unknown as Response;

    const err = new Error("SELECT * FROM secrets WHERE path='/etc/passwd'");
    err.stack = "Error: SELECT * FROM secrets\n    at /opt/dinamic/backend/src/secret.ts:1:1";

    errorHandler(
      err,
      { method: "GET", path: "/api/test", baseUrl: "", route: undefined } as Request,
      res,
      (() => undefined) as NextFunction,
    );

    assert.equal(statusCode, 500);
    const body = JSON.stringify(payload);
    assert.match(body, /INTERNAL_SERVER_ERROR/);
    assert.doesNotMatch(body, /SELECT \*/);
    assert.doesNotMatch(body, /\/opt\/dinamic/);
    assert.doesNotMatch(body, /stack/i);
    assert.equal(
      (payload as { error: { message: string } }).error.message,
      "Ocurrió un error inesperado",
    );
  });
});
