import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { Request, Response } from "express";
import { dbProbe } from "../database/db-probe";
import { getApiHealth, getReadiness } from "./health.controller";

describe("public health endpoints", () => {
  it("liveness returns minimal payload without dependency details", () => {
    let statusCode = 0;
    let body: unknown = null;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: unknown) {
        body = payload;
        return this;
      },
    } as unknown as Response;

    getApiHealth({} as Request, res);
    assert.equal(statusCode, 200);
    assert.deepEqual(Object.keys(body as object).sort(), ["status", "timestamp"]);
    assert.equal((body as { status: string }).status, "ok");
    assert.doesNotMatch(JSON.stringify(body), /database|gcs|bucket|sql/i);
  });

  it("readiness is opaque and does not expose GCS", async () => {
    mock.method(dbProbe, "ping", async () => undefined);
    let statusCode = 0;
    let body: unknown = null;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: unknown) {
        body = payload;
        return this;
      },
    } as unknown as Response;

    await getReadiness({} as Request, res);
    assert.equal(statusCode, 200);
    assert.deepEqual(Object.keys(body as object).sort(), ["status", "timestamp"]);
    assert.doesNotMatch(JSON.stringify(body), /gcs|bucket|configured|connected/i);
  });
});
