import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

let modulesFetchCount = 0;
let permissionsFetchCount = 0;

const moduleStub = (moduleKey: string, isEnabled: boolean) => ({
  companyId: "co-1",
  moduleKey,
  isEnabled,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

mockApiModule("api/company-users.api", {
  getCompanyMembership: async () => {
    permissionsFetchCount += 1;
    return {
      companyId: "co-1",
      companyName: "Empresa Test",
      role: "OWNER",
      isPlatformAdmin: false,
      permissions: [
        "employees:read",
        "services:read",
        "operations:read",
        "attendance:read",
        "absences:read",
        "payroll_receipts:read",
      ],
    };
  },
  getCompanyUsers: async () => ({
    data: [],
    meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
  }),
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

mockApiModule("api/company-modules.api", {
  getCompanyModules: async () => {
    modulesFetchCount += 1;
    return [
      moduleStub("attendance", true),
      moduleStub("operations", true),
      moduleStub("absences", true),
      moduleStub("payroll_receipts", true),
      moduleStub("reports", true),
      moduleStub("bot_simulator", false),
    ];
  },
  updateCompanyModules: async () => {
    throw new Error("not used");
  },
});

import assert from "node:assert/strict";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import React from "react";
import { Route, Routes } from "react-router";

let renderPage: typeof import("../../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../../test/render-page").clearActiveTestQueryClients;
let EntityLink: typeof import("./EntityLink").EntityLink;
let EntityLinkAccessProvider: typeof import("./EntityLinkAccessProvider").EntityLinkAccessProvider;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../../test/render-page"));
  ({ EntityLink } = await import("./EntityLink"));
  ({ EntityLinkAccessProvider } = await import("./EntityLinkAccessProvider"));
});

beforeEach(() => {
  modulesFetchCount = 0;
  permissionsFetchCount = 0;
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
});

function renderLink(ui: React.ReactElement, options?: { withProvider?: boolean }) {
  const wrapped = options?.withProvider ? (
    <EntityLinkAccessProvider>{ui}</EntityLinkAccessProvider>
  ) : (
    ui
  );
  return renderPage(
    <Routes>
      <Route
        path="*"
        element={
          <div
            data-testid="row"
            onClick={() => {
              (window as unknown as { __rowClicked?: boolean }).__rowClicked = true;
            }}
          >
            {wrapped}
          </div>
        }
      />
      <Route path="/employees/:id" element={<div>EMPLOYEE_DETAIL</div>} />
      <Route path="/services/:id" element={<div>SERVICE_DETAIL</div>} />
    </Routes>,
    { route: "/" },
  );
}

describe("EntityLink", () => {
  it("renders a real link for allowed entity with id", async () => {
    const view = renderLink(
      <EntityLink entityType="employee" entityId="emp-1" label="Ada Lovelace" />,
    );
    const link = await waitFor(() => view.getByRole("link", { name: "Ada Lovelace" }));
    assert.equal(link.getAttribute("href"), "/employees/emp-1");
    assert.equal(link.getAttribute("data-entity-link"), "employee");
  });

  it("accepts numeric ids", async () => {
    const view = renderLink(<EntityLink entityType="employee" entityId={42} label="Num" />);
    const link = await waitFor(() => view.getByRole("link", { name: "Num" }));
    assert.equal(link.getAttribute("href"), "/employees/42");
  });

  it("renders non-interactive span without id (stable layout)", async () => {
    const view = renderLink(
      <EntityLink entityType="employee" entityId={null} label="Sin id" title="hint" />,
    );
    const plain = await waitFor(() => view.getByText("Sin id"));
    assert.equal(view.queryByRole("link"), null);
    assert.equal(plain.tagName.toLowerCase(), "span");
    assert.equal(plain.getAttribute("title"), "hint");
    assert.equal(plain.getAttribute("tabIndex"), null);
  });

  it("does not stop propagation by default", async () => {
    (window as unknown as { __rowClicked?: boolean }).__rowClicked = false;
    const view = renderLink(
      <EntityLink entityType="employee" entityId="emp-1" label="Ada" />,
    );
    const link = await waitFor(() => view.getByRole("link", { name: "Ada" }));
    fireEvent.click(link);
    assert.equal((window as unknown as { __rowClicked?: boolean }).__rowClicked, true);
  });

  it("stops row click propagation when opted in", async () => {
    (window as unknown as { __rowClicked?: boolean }).__rowClicked = false;
    const view = renderLink(
      <EntityLink entityType="employee" entityId="emp-1" label="Ada" stopPropagation />,
    );
    const link = await waitFor(() => view.getByRole("link", { name: "Ada" }));
    fireEvent.click(link);
    assert.equal((window as unknown as { __rowClicked?: boolean }).__rowClicked, false);
  });

  it("respects disabled", async () => {
    const disabledView = renderLink(
      <EntityLink entityType="employee" entityId="emp-1" label="Off" disabled />,
    );
    await waitFor(() => disabledView.getByText("Off"));
    assert.equal(disabledView.queryByRole("link"), null);
  });

  it("renders fallback when provided without navigation", async () => {
    const view = renderLink(
      <EntityLink entityType="employee" entityId={null} label="X" fallback={<em>Vacío</em>} />,
    );
    await waitFor(() => view.getByText("Vacío"));
    assert.equal(view.queryByRole("link"), null);
  });

  it("supports ReactNode labels and className", async () => {
    const view = renderLink(
      <EntityLink
        entityType="service"
        entityId="svc-1"
        label={<strong>Servicio X</strong>}
        className="custom-link"
      />,
    );
    const link = await waitFor(() => view.getByRole("link", { name: "Servicio X" }));
    assert.equal(link.getAttribute("href"), "/services/svc-1");
    assert.ok(link.className.includes("custom-link"));
  });

  it("dedupes module/permission fetches across many links with provider", async () => {
    const view = renderLink(
      <>
        {Array.from({ length: 20 }, (_, index) => (
          <EntityLink
            key={index}
            entityType="employee"
            entityId={`emp-${index}`}
            label={`Emp ${index}`}
          />
        ))}
      </>,
      { withProvider: true },
    );
    await waitFor(() => view.getAllByRole("link").length >= 20);
    assert.ok(modulesFetchCount <= 2, `modulesFetchCount=${modulesFetchCount}`);
    assert.ok(permissionsFetchCount <= 2, `permissionsFetchCount=${permissionsFetchCount}`);
  });
});
