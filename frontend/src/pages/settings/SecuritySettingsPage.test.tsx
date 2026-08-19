import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { AUTH_API_EXPORTS, mockApiModule } from "../../test/mock-api-module";
import { installLayoutPolyfills } from "../../test/layout-polyfills";

installLayoutPolyfills();

let statusImpl = async () => ({ enabled: false, remainingRecoveryCodes: 0 });
const setupImpl = async () => ({
  otpauthUri: "otpauth://totp/Dinamic%20Attendance:ops@example.com?secret=ABC&issuer=Dinamic%20Attendance",
  secret: "ABCSECRET",
});
let capturedConfirm: { password?: string; code?: string } | null = null;
const confirmImpl = async (input: { password: string; code: string }) => {
  capturedConfirm = input;
  return { recoveryCodes: ["AAAA-BBBB-CCCC-DDDD-EEEE"] };
};

mockApiModule(
  "api/auth.api",
  {
    getTwoFactorStatus: async () => statusImpl(),
    setupTwoFactor: async () => setupImpl(),
    confirmTwoFactor: async (input: { password: string; code: string }) => confirmImpl(input),
  },
  AUTH_API_EXPORTS,
);

import assert from "node:assert/strict";
import { cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, before, describe, it } from "node:test";
import React from "react";

let renderPage: typeof import("../../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../../test/render-page").clearActiveTestQueryClients;
let SecuritySettingsPage: React.ComponentType;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../../test/render-page"));
  ({ SecuritySettingsPage } = await import("./SecuritySettingsPage"));
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
  sessionStorage.clear();
  localStorage.clear();
  statusImpl = async () => ({ enabled: false, remainingRecoveryCodes: 0 });
  capturedConfirm = null;
});

describe("SecuritySettingsPage", () => {
  it("sends password on confirm, shows recovery codes, and does not persist the password", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    let loggedOut = false;
    const view = renderPage(<SecuritySettingsPage />, {
      route: "/settings/security",
      auth: {
        logout: () => {
          loggedOut = true;
        },
      },
    });

    await waitFor(() => assert.ok(view.getByText(/desactivada/i)));
    await user.click(view.getByRole("button", { name: /activar autenticación en dos pasos/i }));
    await waitFor(() => assert.ok(view.getByAltText(/código qr/i)));
    assert.ok(view.getByText("ABCSECRET"));

    await user.type(view.getByLabelText(/contraseña actual/i), "current-password-1");
    await user.type(view.getByLabelText(/código de autenticación/i), "123456");
    await user.click(view.getByRole("button", { name: /confirmar y activar/i }));

    await waitFor(() => {
      assert.deepEqual(capturedConfirm, { password: "current-password-1", code: "123456" });
      assert.ok(view.getByText("AAAA-BBBB-CCCC-DDDD-EEEE"));
    });
    assert.equal(loggedOut, false);
    assert.equal(sessionStorage.getItem("dinamic_2fa_recovery_codes_once"), null);
    const storageHasPassword = (storage: Storage) => {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key) {
          continue;
        }
        if (key.includes("current-password-1") || (storage.getItem(key) ?? "").includes("current-password-1")) {
          return true;
        }
      }
      return false;
    };
    assert.equal(storageHasPassword(sessionStorage), false);
    assert.equal(storageHasPassword(localStorage), false);

    await user.click(view.getByRole("button", { name: /ya guardé los códigos/i }));
    await waitFor(() => {
      assert.equal(loggedOut, true);
      assert.equal(
        sessionStorage.getItem("dinamic_2fa_recovery_codes_once"),
        JSON.stringify(["AAAA-BBBB-CCCC-DDDD-EEEE"]),
      );
      assert.equal(sessionStorage.getItem("dinamic_2fa_challenge"), null);
    });
  });
});
