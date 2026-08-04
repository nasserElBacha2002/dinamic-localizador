import assert from "node:assert/strict";
import type { Request, Response, NextFunction } from "express";
import { describe, it } from "node:test";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { getValidationMessage, validate } from "./validate";

describe("validate middleware contextual messages", () => {
  it("returns query-specific message for query validation", () => {
    const schema = z.object({
      limit: z.coerce.number().int().min(1).max(100),
    });
    const middleware = validate(schema, "query");
    const req = { query: { limit: "200" } } as unknown as Request;
    let captured: unknown;
    middleware(req, {} as Response, ((error?: unknown) => {
      captured = error;
    }) as NextFunction);

    assert.ok(captured instanceof AppError);
    assert.equal(captured.message, "Parámetros de consulta inválidos.");
    assert.equal(captured.code, "VALIDATION_ERROR");
  });

  it("returns body-specific message for body validation", () => {
    const schema = z.object({ name: z.string().min(1) });
    const middleware = validate(schema, "body");
    const req = { body: { name: "" } } as unknown as Request;
    let captured: unknown;
    middleware(req, {} as Response, ((error?: unknown) => {
      captured = error;
    }) as NextFunction);

    assert.ok(captured instanceof AppError);
    assert.equal(captured.message, "Los datos enviados son inválidos.");
  });

  it("returns params-specific message for params validation", () => {
    const schema = z.object({ id: z.string().uuid() });
    const middleware = validate(schema, "params");
    const req = { params: { id: "not-uuid" } } as unknown as Request;
    let captured: unknown;
    middleware(req, {} as Response, ((error?: unknown) => {
      captured = error;
    }) as NextFunction);

    assert.ok(captured instanceof AppError);
    assert.equal(captured.message, "Parámetros de ruta inválidos.");
  });

  it("exposes getValidationMessage helpers", () => {
    assert.equal(getValidationMessage("query"), "Parámetros de consulta inválidos.");
    assert.equal(getValidationMessage("params"), "Parámetros de ruta inválidos.");
    assert.equal(getValidationMessage("body"), "Los datos enviados son inválidos.");
  });
});
