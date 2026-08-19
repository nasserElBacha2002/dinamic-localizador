import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCorsOrigins } from "./cors-origins";

describe("parseCorsOrigins", () => {
  it("adds a 127.0.0.1 alias for localhost in development", () => {
    const origins = parseCorsOrigins(
      "development",
      "http://localhost:8084",
      "http://localhost:5173",
    );
    assert.equal(origins.includes("http://localhost:8084"), true);
    assert.equal(origins.includes("http://127.0.0.1:8084"), true);
    assert.equal(origins.includes("http://localhost:5173"), true);
    assert.equal(origins.includes("http://127.0.0.1:5173"), true);
  });

  it("does not invent loopback aliases in production", () => {
    const origins = parseCorsOrigins(
      "production",
      "https://app.example.com",
      "https://app.example.com",
    );
    assert.deepEqual(origins, ["https://app.example.com"]);
  });
});
