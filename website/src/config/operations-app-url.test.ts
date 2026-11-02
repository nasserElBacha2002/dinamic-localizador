import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getOperationsAppUrl, getOperationsLoginUrl } from "./operations-app-url";

describe("operations-app-url", () => {
  afterEach(() => {
    delete (globalThis as { __VITE_OPERATIONS_APP_URL__?: string }).__VITE_OPERATIONS_APP_URL__;
  });

  it("usa /login relativo cuando no hay URL de app configurada", () => {
    assert.equal(getOperationsAppUrl(), "");
    assert.equal(getOperationsLoginUrl(), "/login");
  });

  it("usa URL absoluta cuando el entorno de test define base", () => {
    (globalThis as { __VITE_OPERATIONS_APP_URL__?: string }).__VITE_OPERATIONS_APP_URL__ =
      "http://localhost:8084";
    assert.equal(getOperationsAppUrl(), "http://localhost:8084");
    assert.equal(getOperationsLoginUrl(), "http://localhost:8084/login");
  });

  it("builds production-style login URL when app subdomain is configured", () => {
    (globalThis as { __VITE_OPERATIONS_APP_URL__?: string }).__VITE_OPERATIONS_APP_URL__ =
      "https://app.dinamicoperations.com";
    assert.equal(getOperationsLoginUrl(), "https://app.dinamicoperations.com/login");
  });
});
