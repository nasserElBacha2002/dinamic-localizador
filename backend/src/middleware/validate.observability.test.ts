import assert from "node:assert/strict";
import type { Request, Response, NextFunction } from "express";
import { describe, it } from "node:test";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { validate } from "./validate";

describe("validate middleware error format", () => {
  it("returns friendly VALIDATION_ERROR without raw Zod text as primary message", () => {
    const schema = z.object({
      limit: z.coerce.number().int().min(1).max(100),
    });
    const middleware = validate(schema, "query");
    const req = { query: { limit: "200" } } as unknown as Request;
    const res = {} as Response;
    let captured: unknown;
    const next = ((error?: unknown) => {
      captured = error;
    }) as NextFunction;

    middleware(req, res, next);

    assert.ok(captured instanceof AppError);
    assert.equal(captured.statusCode, 400);
    assert.equal(captured.code, "VALIDATION_ERROR");
    assert.equal(captured.message, "Parámetros de consulta inválidos.");
    assert.ok(captured.details);
    assert.ok(Array.isArray((captured.details as { issues: unknown[] }).issues));
  });
});
