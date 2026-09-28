import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { afterEach, describe, it } from "node:test";
import cors from "cors";
import express from "express";
import { parseCorsOrigins } from "./cors-origins";

/**
 * CORS boundary tests (LOC-P1-006).
 * CORS is not authentication — these assert browser Origin allowlist behavior only.
 */
describe("CORS browser boundary policy", () => {
  let server: Server | null = null;

  afterEach(async () => {
    if (!server) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    server = null;
  });

  const start = async (allowedOrigins: string[]) => {
    const app = express();
    app.use(
      cors({
        origin: (origin, callback) => {
          if (!origin) {
            callback(null, true);
            return;
          }
          if (allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
          }
          callback(null, false);
        },
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
        credentials: false,
      }),
    );
    app.get("/api/health", (_req, res) => {
      res.status(200).json({ ok: true });
    });

    server = createServer(app);
    await new Promise<void>((resolve) => {
      server!.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Unable to resolve test server port");
    }
    return `http://127.0.0.1:${address.port}`;
  };

  it("allowed frontend origin receives Access-Control-Allow-Origin", async () => {
    const origins = parseCorsOrigins(
      "production",
      "https://app.example.com",
      "https://app.example.com",
    );
    const baseUrl = await start(origins);
    const response = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: "https://app.example.com" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://app.example.com");
  });

  it("unknown browser origin is denied CORS headers (request still reaches handler)", async () => {
    const origins = parseCorsOrigins(
      "production",
      "https://app.example.com",
      "https://app.example.com",
    );
    const baseUrl = await start(origins);
    const response = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: "https://evil.example" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });

  it("missing Origin (server-to-server / Twilio-style) is not blocked by CORS", async () => {
    const origins = parseCorsOrigins(
      "production",
      "https://app.example.com",
      "https://app.example.com",
    );
    const baseUrl = await start(origins);
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean };
    assert.equal(body.ok, true);
  });

  it("OPTIONS preflight for allowed origin returns expected methods/headers", async () => {
    const origins = parseCorsOrigins(
      "production",
      "https://app.example.com",
      "https://app.example.com",
    );
    const baseUrl = await start(origins);
    const response = await fetch(`${baseUrl}/api/health`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://app.example.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    assert.ok(response.status === 204 || response.status === 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://app.example.com");
    const allowMethods = response.headers.get("access-control-allow-methods") ?? "";
    assert.match(allowMethods, /POST/i);
    const allowHeaders = (response.headers.get("access-control-allow-headers") ?? "").toLowerCase();
    assert.match(allowHeaders, /authorization/);
    assert.match(allowHeaders, /content-type/);
  });
});
