import { setupDomEnvironment } from "../test/setup-dom";

setupDomEnvironment();

import { installLayoutPolyfills } from "../test/layout-polyfills";

installLayoutPolyfills();

import assert from "node:assert/strict";
import { cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import type { LoginResult, PublicUser } from "../api/auth.api";

let renderPage: typeof import("../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../test/render-page").clearActiveTestQueryClients;
let LoginPage: React.ComponentType;

const guestUser: PublicUser = {
  id: "user-1",
  name: "Operador",
  email: "ops@example.com",
  role: "ADMIN",
  isPlatformAdmin: false,
};

let loginImpl: (email: string, password: string) => Promise<LoginResult> = async () => ({
  requiresTwoFactor: false,
  token: "session-token",
  user: guestUser,
});
let storedToken: string | null = null;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../test/render-page"));
  ({ LoginPage } = await import("./LoginPage"));
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
  sessionStorage.clear();
  localStorage.clear();
  storedToken = null;
  loginImpl = async () => ({
    requiresTwoFactor: false,
    token: "session-token",
    user: guestUser,
  });
});

describe("LoginPage 2FA branch", () => {
  it("does not store a session JWT when the API requires two-factor", async () => {
    loginImpl = async () => ({
      requiresTwoFactor: true,
      challengeToken: "challenge-token-value",
    });
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderPage(<LoginPage />, {
      route: "/login",
      auth: {
        isAuthenticated: false,
        isLoading: false,
        user: null,
        token: null,
        login: async (email, password) => {
          const result = await loginImpl(email, password);
          if (!result.requiresTwoFactor) {
            storedToken = result.token;
          }
          return result;
        },
      },
    });

    await user.type(view.getByLabelText(/^Email$/i), "ops@example.com");
    await user.type(view.getByLabelText(/^Contraseña$/i), "password12");
    await user.click(view.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      assert.equal(sessionStorage.getItem("dinamic_2fa_challenge"), "challenge-token-value");
    });
    assert.equal(storedToken, null);
    assert.equal(localStorage.getItem("dinamic_auth_token"), null);
  });
});
