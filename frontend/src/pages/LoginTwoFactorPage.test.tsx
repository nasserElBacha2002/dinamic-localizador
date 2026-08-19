import { setupDomEnvironment } from "../test/setup-dom";

setupDomEnvironment();

import { AUTH_API_EXPORTS, mockApiModule } from "../test/mock-api-module";
import { installLayoutPolyfills } from "../test/layout-polyfills";

installLayoutPolyfills();

let loginWithTwoFactorImpl: (input: {
  challengeToken: string;
  code?: string;
  recoveryCode?: string;
}) => Promise<{ requiresTwoFactor: false; token: string; user: { id: string; name: string; email: string; role: "ADMIN"; isPlatformAdmin: boolean } }> =
  async () => {
    throw new Error("not implemented");
  };

mockApiModule(
  "api/auth.api",
  {
    loginWithTwoFactor: async (input: {
      challengeToken: string;
      code?: string;
      recoveryCode?: string;
    }) => loginWithTwoFactorImpl(input),
  },
  AUTH_API_EXPORTS,
);

import assert from "node:assert/strict";
import { cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, before, describe, it } from "node:test";
import { Route, Routes } from "react-router";
import React from "react";
import { persistTwoFactorChallenge } from "../utils/two-factor-challenge";
import { ApiError } from "../utils/errors";

let renderPage: typeof import("../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../test/render-page").clearActiveTestQueryClients;
let LoginTwoFactorPage: React.ComponentType;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../test/render-page"));
  ({ LoginTwoFactorPage } = await import("./LoginTwoFactorPage"));
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
  sessionStorage.clear();
  localStorage.clear();
  loginWithTwoFactorImpl = async () => {
    throw new Error("not implemented");
  };
});

const guestAuth = {
  isAuthenticated: false,
  isLoading: false,
  user: null,
  token: null,
};

function renderTwoFactorFlow(auth: Partial<typeof guestAuth> & Record<string, unknown> = {}) {
  return renderPage(
    <Routes>
      <Route path="/login" element={<div>login-screen</div>} />
      <Route path="/login/2fa" element={<LoginTwoFactorPage />} />
    </Routes>,
    { route: "/login/2fa", auth: { ...guestAuth, ...auth } },
  );
}

describe("LoginTwoFactorPage", () => {
  it("redirects to login when the challenge is missing", async () => {
    const view = renderTwoFactorFlow();
    await waitFor(() => {
      assert.ok(view.getByText("login-screen"));
    });
  });

  it("stores the session JWT after a valid TOTP and can switch to recovery mode", async () => {
    persistTwoFactorChallenge("challenge-token-value");
    let established: { token: string } | null = null;
    loginWithTwoFactorImpl = async (input) => {
      assert.equal(input.challengeToken, "challenge-token-value");
      assert.equal(input.code, "123456");
      return {
        requiresTwoFactor: false,
        token: "final-session-token",
        user: {
          id: "user-1",
          name: "Ops",
          email: "ops@example.com",
          role: "ADMIN",
          isPlatformAdmin: false,
        },
      };
    };
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderTwoFactorFlow({
      completeTwoFactorLogin: (token: string) => {
        established = { token };
      },
    });

    await user.click(view.getByRole("button", { name: /usar un código de recuperación/i }));
    assert.ok(view.getByLabelText(/código de recuperación/i));
    await user.click(view.getByRole("button", { name: /usar código de autenticación/i }));

    await user.type(view.getByLabelText(/código de autenticación/i), "123456");
    await user.click(view.getByRole("button", { name: /^verificar$/i }));

    await waitFor(() => {
      assert.equal(established?.token, "final-session-token");
    });
    assert.equal(sessionStorage.getItem("dinamic_2fa_challenge"), null);
    assert.equal(localStorage.getItem("dinamic_auth_token"), null);
    assert.equal(sessionStorage.getItem("dinamic_auth_token"), null);
  });

  it("clears the challenge when it is expired", async () => {
    persistTwoFactorChallenge("expired-challenge");
    loginWithTwoFactorImpl = async () => {
      throw new ApiError("El desafío de autenticación no es válido o expiró.", "INVALID_TWO_FACTOR_CHALLENGE", 401);
    };
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderTwoFactorFlow();
    await user.type(view.getByLabelText(/código de autenticación/i), "123456");
    await user.click(view.getByRole("button", { name: /^verificar$/i }));
    await waitFor(() => {
      assert.equal(sessionStorage.getItem("dinamic_2fa_challenge"), null);
      assert.ok(view.getByText("login-screen"));
    });
  });
});
