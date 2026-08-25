import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import {
  geocodeQueryWithRetry,
  isTransientGeocodeFailure,
  toGeocodeFailure,
} from "./google-geocode";

describe("google-geocode helpers", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("treats 429 and 5xx as transient", () => {
    assert.equal(
      isTransientGeocodeFailure(toGeocodeFailure("q", "HTTP_ERROR", "HTTP 429", 429)),
      true,
    );
    assert.equal(
      isTransientGeocodeFailure(toGeocodeFailure("q", "HTTP_ERROR", "HTTP 500", 500)),
      true,
    );
    assert.equal(
      isTransientGeocodeFailure(toGeocodeFailure("q", "OVER_QUERY_LIMIT", "limit")),
      true,
    );
  });

  it("does not retry ZERO_RESULTS / INVALID_REQUEST", () => {
    assert.equal(
      isTransientGeocodeFailure(toGeocodeFailure("q", "ZERO_RESULTS", "none")),
      false,
    );
    assert.equal(
      isTransientGeocodeFailure(toGeocodeFailure("q", "INVALID_REQUEST", "bad")),
      false,
    );
  });

  it("retries transient failures then succeeds", async () => {
    let calls = 0;
    mock.method(globalThis, "fetch", async () => {
      calls += 1;
      if (calls < 2) {
        return new Response("busy", { status: 429, statusText: "Too Many Requests" });
      }
      return new Response(
        JSON.stringify({
          status: "OK",
          results: [
            {
              formatted_address: "Caballito, CABA",
              address_components: [{ short_name: "AR", types: ["country"] }],
              geometry: { location: { lat: -34.62, lng: -58.44 } },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await geocodeQueryWithRetry("Caballito, Argentina", "key", {
      maxAttempts: 3,
      baseDelayMs: 1,
    });
    assert.equal(result.status, "OK");
    assert.equal(calls, 2);
  });

  it("returns ZERO_RESULTS without endless retry", async () => {
    let calls = 0;
    mock.method(globalThis, "fetch", async () => {
      calls += 1;
      return new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const result = await geocodeQueryWithRetry("Nowhere", "key", {
      maxAttempts: 3,
      baseDelayMs: 1,
    });
    assert.equal(result.status, "ZERO_RESULTS");
    assert.equal(calls, 1);
  });

  it("surfaces HTTP 500 after retries", async () => {
    let calls = 0;
    mock.method(globalThis, "fetch", async () => {
      calls += 1;
      return new Response("err", { status: 500, statusText: "Internal Server Error" });
    });

    const result = await geocodeQueryWithRetry("q", "key", {
      maxAttempts: 2,
      baseDelayMs: 1,
    });
    assert.equal(result.status, "HTTP_ERROR");
    assert.equal(calls, 2);
  });

  it("retries TIMEOUT then succeeds", async () => {
    let calls = 0;
    mock.method(globalThis, "fetch", async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("The operation was aborted due to timeout");
        error.name = "TimeoutError";
        throw error;
      }
      return new Response(
        JSON.stringify({
          status: "OK",
          results: [
            {
              formatted_address: "ok",
              address_components: [{ short_name: "AR", types: ["country"] }],
              geometry: { location: { lat: -34.62, lng: -58.44 } },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await geocodeQueryWithRetry("q", "key", {
      maxAttempts: 3,
      baseDelayMs: 1,
      timeoutMs: 50,
    });
    assert.equal(result.status, "OK");
    assert.equal(calls, 2);
  });

  it("fails after max TIMEOUT attempts", async () => {
    let calls = 0;
    mock.method(globalThis, "fetch", async () => {
      calls += 1;
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });

    const result = await geocodeQueryWithRetry("q", "key", {
      maxAttempts: 2,
      baseDelayMs: 1,
      timeoutMs: 10,
    });
    assert.equal(result.status, "TIMEOUT");
    assert.equal(calls, 2);
    assert.equal(isTransientGeocodeFailure(toGeocodeFailure("q", "TIMEOUT", "t")), true);
  });

  it("geocodeQueryCandidates returns all coordinate results in provider order", async () => {
    mock.method(globalThis, "fetch", async () => {
      return new Response(
        JSON.stringify({
          status: "OK",
          results: [
            {
              formatted_address: "Wrong province",
              address_components: [
                { long_name: "Córdoba", short_name: "X", types: ["administrative_area_level_1"] },
                { short_name: "AR", types: ["country"] },
              ],
              geometry: { location: { lat: -31.4, lng: -64.2 } },
            },
            {
              formatted_address: "CABA match",
              address_components: [
                {
                  long_name: "Ciudad Autónoma de Buenos Aires",
                  short_name: "CABA",
                  types: ["administrative_area_level_1"],
                },
                { short_name: "AR", types: ["country"] },
              ],
              geometry: { location: { lat: -34.6, lng: -58.4 } },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const { geocodeQueryCandidates } = await import("./google-geocode");
    const result = await geocodeQueryCandidates("Centro", "key");
    assert.equal(result.status, "OK");
    if (result.status !== "OK") {
      return;
    }
    assert.equal(result.candidates.length, 2);
    assert.equal(result.candidates[0]?.latitude, -31.4);
    assert.equal(result.candidates[1]?.latitude, -34.6);
  });
});
