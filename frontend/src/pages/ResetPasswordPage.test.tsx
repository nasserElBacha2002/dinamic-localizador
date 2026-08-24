import { setupDomEnvironment } from "../test/setup-dom";

setupDomEnvironment();

import { AUTH_API_EXPORTS, mockApiModule } from "../test/mock-api-module";
import { installLayoutPolyfills } from "../test/layout-polyfills";

installLayoutPolyfills();

let resetPasswordImpl: (input: {
  token: string;
  password: string;
  passwordConfirmation: string;
}) => Promise<{ message: string }> = async () => ({
  message: "Contraseña actualizada correctamente. Iniciá sesión nuevamente.",
});
let loginCalls = 0;
let setStoredTokenCalls = 0;

mockApiModule(
  "api/auth.api",
  {
    resetPassword: async (input: {
      token: string;
      password: string;
      passwordConfirmation: string;
    }) => resetPasswordImpl(input),
    setStoredToken: () => {
      setStoredTokenCalls += 1;
    },
  },
  AUTH_API_EXPORTS,
);

import assert from "node:assert/strict";
import { cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { ApiError } from "../utils/errors";

let renderPage: typeof import("../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../test/render-page").clearActiveTestQueryClients;
let ResetPasswordPage: React.ComponentType;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../test/render-page"));
  ({ ResetPasswordPage } = await import("./ResetPasswordPage"));
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
  resetPasswordImpl = async () => ({
    message: "Contraseña actualizada correctamente. Iniciá sesión nuevamente.",
  });
  loginCalls = 0;
  setStoredTokenCalls = 0;
  sessionStorage.clear();
  localStorage.clear();
});

const guestAuth = {
  isAuthenticated: false,
  isLoading: false,
  user: null,
  token: null,
  login: async () => {
    loginCalls += 1;
    return {
      requiresTwoFactor: false as const,
      token: "should-not-store",
      user: {
        id: "u1",
        name: "Ops",
        email: "ops@example.com",
        role: "ADMIN" as const,
        isPlatformAdmin: false,
      },
    };
  },
};

describe("ResetPasswordPage", () => {
  it("persists the query token, strips it from the URL, and does not use auth storage", async () => {
    window.history.replaceState(
      window.history.state,
      "",
      "/reset-password?token=reset-token-from-query-aaaaaaaa",
    );
    renderPage(<ResetPasswordPage />, { route: "/reset-password", auth: guestAuth });

    await waitFor(() => {
      assert.equal(sessionStorage.getItem("dinamic_password_reset_token_v1"), "reset-token-from-query-aaaaaaaa");
    });
    assert.equal(new URL(window.location.href).searchParams.has("token"), false);
    assert.equal(localStorage.getItem("dinamic_auth_token"), null);
    assert.equal(setStoredTokenCalls, 0);
  });

  it("clears sessionStorage on success and does not auto-login", async () => {
    window.history.replaceState(
      window.history.state,
      "",
      "/reset-password?token=reset-token-success-bbbbbbbb",
    );
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderPage(<ResetPasswordPage />, { route: "/reset-password", auth: guestAuth });

    await user.type(view.getByLabelText(/^Nueva contraseña$/i), "new-password-1");
    await user.type(view.getByLabelText(/^Confirmar contraseña$/i), "new-password-1");
    await user.click(view.getByRole("button", { name: /restablecer contraseña/i }));

    await waitFor(() => {
      assert.ok(view.getByText(/contraseña actualizada correctamente/i));
    });
    assert.equal(sessionStorage.getItem("dinamic_password_reset_token_v1"), null);
    assert.equal(loginCalls, 0);
    assert.equal(setStoredTokenCalls, 0);
  });

  it("shows the invalid-token API error", async () => {
    window.history.replaceState(
      window.history.state,
      "",
      "/reset-password?token=expired-or-used-token-cccccccc",
    );
    resetPasswordImpl = async () => {
      throw new ApiError(
        "El enlace de restablecimiento no es válido o ya no está disponible.",
        "INVALID_PASSWORD_RESET_TOKEN",
        400,
      );
    };
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderPage(<ResetPasswordPage />, { route: "/reset-password", auth: guestAuth });

    await user.type(view.getByLabelText(/^Nueva contraseña$/i), "new-password-1");
    await user.type(view.getByLabelText(/^Confirmar contraseña$/i), "new-password-1");
    await user.click(view.getByRole("button", { name: /restablecer contraseña/i }));

    await waitFor(() => {
      assert.ok(view.getByText(/enlace de restablecimiento no es válido/i));
    });
    assert.ok(view.getByRole("link", { name: /iniciar sesión/i }));
  });

  it("validates password confirmation locally without calling the API", async () => {
    let apiCalls = 0;
    resetPasswordImpl = async () => {
      apiCalls += 1;
      return { message: "should-not-run" };
    };
    window.history.replaceState(
      window.history.state,
      "",
      "/reset-password?token=reset-token-mismatch-dddddddd",
    );
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderPage(<ResetPasswordPage />, { route: "/reset-password", auth: guestAuth });

    await user.type(view.getByLabelText(/^Nueva contraseña$/i), "new-password-1");
    await user.type(view.getByLabelText(/^Confirmar contraseña$/i), "other-password-1");
    await user.click(view.getByRole("button", { name: /restablecer contraseña/i }));

    await waitFor(() => {
      assert.ok(view.getByText(/las contraseñas no coinciden/i));
    });
    assert.equal(apiCalls, 0);
  });
});
