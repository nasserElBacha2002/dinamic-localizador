import { setupDomEnvironment } from "../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { installLayoutPolyfills } from "../test/layout-polyfills";
import { mockViewport } from "../test/mock-match-media";

installLayoutPolyfills();

let renderPage: typeof import("../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../test/render-page").clearActiveTestQueryClients;
let LoginPage: React.ComponentType;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../test/render-page"));
  ({ LoginPage } = await import("./LoginPage"));
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
  mockViewport("desktop");
});

describe("LoginPage responsive (real page)", () => {
  it("renders login form on mobile", async () => {
    mockViewport("mobile");
    const view = renderPage(<LoginPage />, {
      route: "/login",
      auth: {
        isAuthenticated: false,
        isLoading: false,
        user: null,
        token: null,
      },
    });

    await waitFor(() => assert.ok(view.getByLabelText(/email/i)));
    assert.ok(view.getByLabelText(/contraseña/i));
    assert.ok(view.getByRole("button", { name: /ingresar|iniciar/i }));
  });
});
