import assert from "node:assert/strict";
import { afterEach, before, describe, it, mock } from "node:test";
import axios, { AxiosError } from "axios";
import { apiClient } from "./client";
import { clearStoredToken, getStoredToken, setStoredToken } from "./token-storage";
import { logout, type LogoutResult } from "./auth.api";

const installMemoryLocalStorage = (): void => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
  });
};

const clearLocalSession = (): void => {
  clearStoredToken();
};

describe("auth.api logout result semantics", () => {
  before(() => {
    installMemoryLocalStorage();
  });

  afterEach(() => {
    mock.restoreAll();
    clearStoredToken();
  });

  it("POST logout 200 → serverRevoked=true; local token cleared by session cleanup", async () => {
    setStoredToken("jwt-valid");
    mock.method(apiClient, "post", async () => ({
      data: { data: { message: "Sesión cerrada." } },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {},
    }));

    const result: LogoutResult = await logout();
    assert.equal(result.localLogoutAllowed, true);
    assert.equal(result.serverRevoked, true);
    clearLocalSession();
    assert.equal(getStoredToken(), null);
  });

  it("POST logout 401 INVALID_TOKEN → already invalid treated as serverRevoked=true", async () => {
    setStoredToken("jwt-stale");
    mock.method(apiClient, "post", async () => {
      throw new AxiosError(
        "Unauthorized",
        "ERR_BAD_REQUEST",
        undefined,
        undefined,
        {
          data: { error: { code: "INVALID_TOKEN", message: "Token inválido o expirado." } },
          status: 401,
          statusText: "Unauthorized",
          headers: {},
          config: {} as never,
        },
      );
    });

    const result = await logout();
    assert.equal(result.localLogoutAllowed, true);
    assert.equal(result.serverRevoked, true);
    clearLocalSession();
    assert.equal(getStoredToken(), null);
  });

  it("POST logout 500 → serverRevoked=false; local token still cleared", async () => {
    setStoredToken("jwt-valid");
    mock.method(apiClient, "post", async () => {
      throw new AxiosError(
        "Server Error",
        "ERR_BAD_RESPONSE",
        undefined,
        undefined,
        {
          data: { error: { code: "INTERNAL_ERROR", message: "Error interno." } },
          status: 500,
          statusText: "Internal Server Error",
          headers: {},
          config: {} as never,
        },
      );
    });

    const result = await logout();
    assert.equal(result.localLogoutAllowed, true);
    assert.equal(result.serverRevoked, false);
    if (!result.serverRevoked) {
      assert.equal(result.reason, "server_error");
    }
    clearLocalSession();
    assert.equal(getStoredToken(), null);
  });

  it("POST logout network timeout → serverRevoked=false; local token cleared", async () => {
    setStoredToken("jwt-valid");
    mock.method(apiClient, "post", async () => {
      const error = new AxiosError("timeout", "ECONNABORTED");
      assert.equal(axios.isAxiosError(error), true);
      throw error;
    });

    const result = await logout();
    assert.equal(result.localLogoutAllowed, true);
    assert.equal(result.serverRevoked, false);
    if (!result.serverRevoked) {
      assert.equal(result.reason, "network");
    }
    clearLocalSession();
    assert.equal(getStoredToken(), null);
  });
});
