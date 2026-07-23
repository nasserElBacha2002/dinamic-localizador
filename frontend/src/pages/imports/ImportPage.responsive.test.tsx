import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";
import { mockViewport } from "../../test/mock-match-media";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

const previewResult = {
  entityType: "operations" as const,
  confirmationToken: "tok-1",
  fileType: "csv",
  displayColumns: [
    { key: "name", header: "Nombre" },
    { key: "date", header: "Fecha" },
    { key: "service", header: "Servicio" },
    { key: "notes", header: "Notas" },
  ],
  rows: [
    {
      rowNumber: 2,
      status: "valid" as const,
      values: {
        name: "Op Centro",
        date: "2026-08-01",
        service: "Sucursal 1",
        notes: "ok",
      },
      errors: [],
    },
    {
      rowNumber: 3,
      status: "invalid" as const,
      values: {
        name: "",
        date: "bad",
        service: "",
        notes: "",
      },
      errors: [{ field: "name", message: "Nombre obligatorio" }],
    },
  ],
  summary: {
    totalRows: 2,
    validRows: 1,
    invalidRows: 1,
    warningRows: 0,
    canConfirm: false,
  },
  fileErrors: [] as Array<{ message: string }>,
};

mockApiModule("api/imports.api", {
  downloadImportTemplate: async () => new Blob(["template"]),
  previewImport: async () => previewResult,
  executeImport: async () => {
    throw new Error("not used");
  },
});

mockApiModule("api/company-users.api", {
  getCompanyMembership: async () => ({
    companyId: "co-1",
    companyName: "Empresa Test",
    role: "ADMIN",
    isPlatformAdmin: false,
    permissions: ["operations:manage", "services:manage", "employees:manage"],
  }),
  getCompanyUsers: async () => ({ data: [], meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } }),
  getCompanyUserById: async () => {
    throw new Error("not used");
  },
  createCompanyUser: async () => {
    throw new Error("not used");
  },
  updateCompanyUser: async () => {
    throw new Error("not used");
  },
  deactivateCompanyUser: async () => {
    throw new Error("not used");
  },
  getActiveCompanyMembershipPath: () => null,
});

import assert from "node:assert/strict";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { Route, Routes } from "react-router-dom";

let renderPage: typeof import("../../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../../test/render-page").clearActiveTestQueryClients;
let ImportPage: React.ComponentType;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../../test/render-page"));
  ({ ImportPage } = await import("./ImportPage"));
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
  mockViewport("desktop");
});

describe("ImportPage responsive (real page)", () => {
  it("shows entity selector and file step on desktop", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <Routes>
        <Route path="/imports" element={<ImportPage />} />
      </Routes>,
      { route: "/imports" },
    );

    await waitFor(() => assert.ok(view.getByText("Importaciones")));
    assert.ok(view.getByText("Tipo de importación"));
    assert.ok(view.getByText(/Paso 1/));
  });

  it("shows mobile summary cards after preview", async () => {
    mockViewport("mobile");
    const view = renderPage(
      <Routes>
        <Route path="/imports" element={<ImportPage />} />
      </Routes>,
      { route: "/imports" },
    );

    await waitFor(() => assert.ok(view.getByText("Importaciones")));

    const fileInput = view.container.querySelector('input[type="file"]');
    assert.ok(fileInput);

    const file = new File(["a,b\n1,2"], "ops.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => assert.ok(view.getByText("Fila 2")));
    assert.equal(view.queryByRole("table"), null);
    assert.ok(view.getByText("Fila 3"));
    fireEvent.click(view.getByText("Fila 3"));
    await waitFor(() => assert.ok(view.getByText("Nombre obligatorio")));
  });
});
