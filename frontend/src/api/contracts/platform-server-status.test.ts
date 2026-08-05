import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePlatformServerStatus } from "./platform-server-status";

describe("platform server status contract", () => {
  it("parses a valid snapshot", () => {
    const parsed = parsePlatformServerStatus({
      status: "error",
      backend: {
        status: "ok",
        service: "dinamic-attendance-api",
        checkedAt: "2026-08-04T12:00:00.000Z",
      },
      database: {
        status: "error",
        message: "No se pudo conectar con la base de datos",
        durationMs: 9,
        checkedAt: "2026-08-04T12:00:00.000Z",
      },
      gcs: {
        status: "disabled",
        message: "Almacenamiento no configurado",
        durationMs: 1,
        checkedAt: "2026-08-04T12:00:00.000Z",
      },
      timestamp: "2026-08-04T12:00:00.000Z",
    });
    assert.equal(parsed.status, "error");
    assert.equal(parsed.gcs.status, "disabled");
  });

  it("rejects invalid payloads", () => {
    assert.throws(() => parsePlatformServerStatus({ status: "ok" }), /inválida/);
  });
});
