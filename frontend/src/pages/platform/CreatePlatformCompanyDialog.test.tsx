/**
 * Create company dialog: scroll layout, visible validation, submit gating.
 */
import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { installLayoutPolyfills } from "../../test/layout-polyfills";
import { mockViewport } from "../../test/mock-match-media";

installLayoutPolyfills();

let renderPage: typeof import("../../test/render-page").renderPage;
let CreatePlatformCompanyDialog: typeof import("./CreatePlatformCompanyDialog").CreatePlatformCompanyDialog;

before(async () => {
  ({ renderPage } = await import("../../test/render-page"));
  ({ CreatePlatformCompanyDialog } = await import("./CreatePlatformCompanyDialog"));
});

afterEach(() => {
  cleanup();
  mockViewport("desktop");
});

async function typeField(user: ReturnType<typeof userEvent.setup>, field: string, value: string) {
  const root = document.querySelector(`[data-create-company-field="${field}"]`);
  assert.ok(root, `missing field ${field}`);
  const input = root.querySelector("input");
  assert.ok(input, `missing input for ${field}`);
  await user.clear(input);
  await user.type(input, value);
}

describe("CreatePlatformCompanyDialog", () => {
  it("keeps header/footer accessible and uses a scroll body", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <CreatePlatformCompanyDialog
        open
        onClose={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    assert.ok(view.getByRole("dialog"));
    assert.ok(view.getByRole("heading", { name: /^Crear empresa$/i }));
    assert.ok(document.querySelector("[data-testid='responsive-modal-scroll-body']"));
    assert.ok(document.querySelector("[data-testid='responsive-modal-footer']"));
    assert.ok(view.getByRole("button", { name: /Cancelar/i }));
    assert.ok(view.getByRole("button", { name: /^Crear empresa$/i }));
    assert.ok(document.querySelector('[data-create-company-field="ownerEmail"] input'));
  });

  it("shows compact field errors and keeps submit enabled until request starts", async () => {
    mockViewport("desktop");
    let submitted = 0;
    const view = renderPage(
      <CreatePlatformCompanyDialog
        open
        onClose={() => undefined}
        onSubmit={() => {
          submitted += 1;
        }}
      />,
    );

    const submit = view.getByRole("button", { name: /^Crear empresa$/i });
    assert.equal(submit.hasAttribute("disabled"), false);
    fireEvent.click(submit);

    await waitFor(() => {
      assert.ok(view.getByText(/Revisá los datos del formulario/i));
    });
    assert.ok(view.getByText(/campos para revisar/i));
    assert.ok(view.getAllByText(/nombre de la empresa es obligatorio/i).length >= 1);
    assert.equal(submitted, 0);
  });

  it("clears a field error after the user corrects the value", async () => {
    mockViewport("desktop");
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderPage(
      <CreatePlatformCompanyDialog
        open
        onClose={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: /^Crear empresa$/i }));
    await waitFor(() => {
      assert.ok(view.getAllByText(/nombre de la empresa es obligatorio/i).length >= 1);
    });

    await typeField(user, "name", "Empresa Corregida");

    await waitFor(() => {
      assert.equal(view.queryAllByText(/nombre de la empresa es obligatorio/i).length, 0);
    });
  });

  it("submits once when the user double-clicks create", async () => {
    mockViewport("desktop");
    const user = userEvent.setup({ document: globalThis.document });
    let submitted = 0;
    const view = renderPage(
      <CreatePlatformCompanyDialog
        open
        onClose={() => undefined}
        onSubmit={async () => {
          submitted += 1;
          await new Promise((resolve) => setTimeout(resolve, 40));
        }}
      />,
    );

    await typeField(user, "name", "Nueva Empresa");
    await typeField(user, "ownerName", "Ana Owner");
    await typeField(user, "ownerEmail", "ana@example.com");

    const submit = view.getByRole("button", { name: /^Crear empresa$/i });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => {
      assert.equal(submitted, 1);
    });
  });

  it("submits a complete overnight schedule payload with numeric settings", async () => {
    mockViewport("desktop");
    const user = userEvent.setup({ document: globalThis.document });
    let payload: unknown = null;
    const view = renderPage(
      <CreatePlatformCompanyDialog
        open
        onClose={() => undefined}
        onSubmit={(input) => {
          payload = input;
        }}
      />,
    );

    await typeField(user, "name", "Nueva Empresa");
    await typeField(user, "ownerName", "Ana Owner");
    await typeField(user, "ownerEmail", "ana@example.com");

    fireEvent.click(view.getByRole("button", { name: /^Crear empresa$/i }));

    await waitFor(() => {
      assert.ok(payload);
    });

    const typed = payload as {
      name: string;
      settings?: {
        defaultOperationStartTime?: string | null;
        defaultOperationEndTime?: string | null;
        defaultRadiusMeters?: number;
        lateGraceMinutes?: number;
      };
      owner: { email: string };
    };
    assert.equal(typed.name, "Nueva Empresa");
    assert.equal(typed.owner.email, "ana@example.com");
    assert.equal(typed.settings?.defaultOperationStartTime, "20:30");
    assert.equal(typed.settings?.defaultOperationEndTime, "03:00");
    assert.equal(typeof typed.settings?.defaultRadiusMeters, "number");
    assert.equal(typeof typed.settings?.lateGraceMinutes, "number");
  });

  it("disables submit while loading and keeps API error visible without closing", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <CreatePlatformCompanyDialog
        open
        loading
        errorMessage="La empresa ya existe."
        onClose={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    assert.ok(view.getByText(/La empresa ya existe/i));
    assert.equal(view.getByRole("button", { name: /^Crear empresa$/i }).hasAttribute("disabled"), true);
    assert.equal(view.getByRole("button", { name: /Cancelar/i }).hasAttribute("disabled"), true);
    assert.ok(view.getByRole("dialog"));
  });

  it("uses fullscreen shell on mobile while keeping footer", () => {
    mockViewport("mobile");
    const view = renderPage(
      <CreatePlatformCompanyDialog
        open
        onClose={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    assert.ok(document.querySelector("[data-fullscreen='true']"));
    assert.ok(within(view.baseElement).getByTestId("responsive-modal-footer"));
    assert.ok(within(view.baseElement).getByTestId("responsive-modal-scroll-body"));
  });
});
