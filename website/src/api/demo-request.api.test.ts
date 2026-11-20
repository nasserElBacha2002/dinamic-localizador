import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import { isDemoSubmitEnabled, submitDemoRequest } from "./demo-request.api";

describe("demo-request.api", () => {
  const previousFetch = globalThis.fetch;
  const globalWithVite = globalThis as { __VITE_API_URL__?: string };

  before(() => {
    globalWithVite.__VITE_API_URL__ = "http://api.test.local/api";
  });

  after(() => {
    globalThis.fetch = previousFetch;
    delete globalWithVite.__VITE_API_URL__;
  });

  it("enables submit when VITE_API_URL is set", () => {
    assert.equal(isDemoSubmitEnabled(), true);
  });

  it("rejects 200 when delivery is not confirmed and message is not the public success copy", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { delivered: false, message: "noop" } }),
    })) as typeof fetch;

    await assert.rejects(
      () =>
        submitDemoRequest({
          fullName: "Ana",
          company: "Acme",
          email: "ana@acme.com",
          employeeRange: "1-25",
          companyWebsite: "",
        }),
      /No pudimos confirmar/,
    );
  });

  it("accepts honeypot-style success when delivered is false but message matches", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          delivered: false,
          message: "Recibimos tu solicitud. Te contactaremos a la brevedad.",
        },
      }),
    })) as typeof fetch;

    const result = await submitDemoRequest({
      fullName: "Ana",
      company: "Acme",
      email: "ana@acme.com",
      employeeRange: "1-25",
      companyWebsite: "",
    });
    assert.equal(result.delivered, false);
  });

  it("returns data when SMTP delivery is confirmed", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: { delivered: true, message: "Recibimos tu solicitud. Te contactaremos a la brevedad." },
      }),
    })) as typeof fetch;

    const result = await submitDemoRequest({
      fullName: "Ana",
      company: "Acme",
      email: "ana@acme.com",
      employeeRange: "1-25",
      companyWebsite: "",
    });
    assert.equal(result.delivered, true);
  });
});