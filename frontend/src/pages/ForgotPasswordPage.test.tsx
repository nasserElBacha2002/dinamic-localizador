import { setupDomEnvironment } from "../test/setup-dom";

setupDomEnvironment();

import { AUTH_API_EXPORTS, mockApiModule } from "../test/mock-api-module";
import { installLayoutPolyfills } from "../test/layout-polyfills";

installLayoutPolyfills();

let requestPasswordResetImpl: (email: string) => Promise<{ message: string }> = async () => ({
  message: "ok",
});

mockApiModule(
  "api/auth.api",
  {
    requestPasswordReset: async (email: string) => requestPasswordResetImpl(email),
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
let ForgotPasswordPage: React.ComponentType;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../test/render-page"));
  ({ ForgotPasswordPage } = await import("./ForgotPasswordPage"));
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
  requestPasswordResetImpl = async () => ({ message: "ok" });
});

const guestAuth = {
  isAuthenticated: false,
  isLoading: false,
  user: null,
  token: null,
};

describe("ForgotPasswordPage", () => {
  it("submits a valid email and shows the generic success message", async () => {
    let submittedEmail = "";
    requestPasswordResetImpl = async (email) => {
      submittedEmail = email;
      return { message: "ignored-specific-message" };
    };
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderPage(<ForgotPasswordPage />, { route: "/forgot-password", auth: guestAuth });

    await user.type(view.getByLabelText(/^Email$/i), "ops@example.com");
    await user.click(view.getByRole("button", { name: /enviar instrucciones/i }));

    await waitFor(() => {
      assert.match(
        view.getByText(/si existe una cuenta asociada a ese email/i).textContent ?? "",
        /restablecer tu contraseña/i,
      );
    });
    assert.equal(submittedEmail, "ops@example.com");
  });

  it("shows the API error handler message when the request fails", async () => {
    requestPasswordResetImpl = async () => {
      throw new ApiError("No se pudieron enviar las instrucciones.", "RATE_LIMITED", 429);
    };
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderPage(<ForgotPasswordPage />, { route: "/forgot-password", auth: guestAuth });

    await user.type(view.getByLabelText(/^Email$/i), "ops@example.com");
    await user.click(view.getByRole("button", { name: /enviar instrucciones/i }));

    await waitFor(() => {
      assert.ok(view.getByText("No se pudieron enviar las instrucciones."));
    });
  });
});
