import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mock } from "node:test";
import { mockCompanyUsersApi, mockRoleCapabilitiesApi } from "../../test/mock-company-users-api";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";
import { mockViewport } from "../../test/mock-match-media";
import type { RoleCapabilities } from "../../types/role-capabilities";
import type { CompanyRole } from "../../types/company-user";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

const adminCapabilities: RoleCapabilities = {
  role: "ADMIN",
  name: "Administrador",
  description: "Administra la operación diaria.",
  isSystemRole: true,
  permissions: [
    {
      code: "employees:read",
      module: "Colaboradores",
      label: "Ver colaboradores",
      description: "Permite consultar colaboradores.",
      documented: true,
    },
  ],
  restrictions: [
    {
      code: "CANNOT_MANAGE_USERS",
      message: "No puede gestionar usuarios de la empresa (invitar, editar o desactivar).",
    },
  ],
};

const operatorCapabilities: RoleCapabilities = {
  role: "OPERATOR",
  name: "Operador",
  description: "Consulta operaciones y asistencias.",
  isSystemRole: true,
  permissions: [
    {
      code: "operations:read",
      module: "Operaciones",
      label: "Ver operaciones",
      description: "Permite consultar operaciones.",
      documented: true,
    },
  ],
  restrictions: [
    {
      code: "CANNOT_MANAGE_USERS",
      message: "No puede gestionar usuarios de la empresa.",
    },
  ],
};

const getRoleCapabilitiesMock = mock.fn(
  async (_companyId: string, role: string): Promise<RoleCapabilities> => {
    if (role === "OPERATOR") return operatorCapabilities;
    return adminCapabilities;
  },
);

mockCompanyUsersApi({
  getCompanyMembership: async () => ({
    companyId: "co-1",
    companyName: "Empresa Test",
    role: "OWNER",
    isPlatformAdmin: false,
    permissions: ["users:manage"],
    assignableRoles: ["ADMIN", "HR", "SUPERVISOR", "OPERATOR", "READ_ONLY"],
    invitableRoles: ["OWNER", "ADMIN", "HR", "SUPERVISOR", "OPERATOR", "READ_ONLY"],
  }),
  getCompanyUsers: async () => ({
    data: [],
    meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
  }),
  getActiveCompanyMembershipPath: () => null,
});

mockRoleCapabilitiesApi({
  getRoleCapabilities: getRoleCapabilitiesMock,
});

import assert from "node:assert/strict";
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import React, { useState } from "react";

let renderPage: typeof import("../../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../../test/render-page").clearActiveTestQueryClients;
let CompanyUserDialog: typeof import("../../pages/settings/CompanyUserDialog").CompanyUserDialog;
let RolePermissionsAction: typeof import("./RolePermissionsAction").RolePermissionsAction;
let RolePermissionsDialog: typeof import("./RolePermissionsDialog").RolePermissionsDialog;
let RoleSelectWithPermissions: typeof import("./RolePermissionsAction").RoleSelectWithPermissions;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../../test/render-page"));
  ({ CompanyUserDialog } = await import("../../pages/settings/CompanyUserDialog"));
  ({ RolePermissionsAction, RoleSelectWithPermissions } = await import("./RolePermissionsAction"));
  ({ RolePermissionsDialog } = await import("./RolePermissionsDialog"));
});

beforeEach(() => {
  getRoleCapabilitiesMock.mock.resetCalls();
  getRoleCapabilitiesMock.mock.mockImplementation(
    async (_companyId: string, role: string): Promise<RoleCapabilities> => {
      if (role === "OPERATOR") return operatorCapabilities;
      return adminCapabilities;
    },
  );
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
});

function ControlledRolePermissionsDialog({
  initialRole,
}: {
  initialRole: CompanyRole;
}) {
  const [role, setRole] = useState<CompanyRole>(initialRole);
  return (
    <div>
      <button type="button" onClick={() => setRole("OPERATOR")}>
        Cambiar a operador
      </button>
      <button type="button" onClick={() => setRole("ADMIN")}>
        Cambiar a administrador
      </button>
      <RolePermissionsDialog opened onClose={() => undefined} role={role} />
    </div>
  );
}

describe("RolePermissionsDialog", () => {
  it("shows empty guidance when role is null and does not call the API", () => {
    const view = renderPage(
      <RolePermissionsDialog opened onClose={() => undefined} role={null} />,
    );
    assert.ok(view.getByText("Seleccioná un rol para consultar sus permisos."));
    assert.equal(getRoleCapabilitiesMock.mock.calls.length, 0);
  });

  it("loads and groups permissions for ADMIN", async () => {
    const view = renderPage(
      <RolePermissionsDialog opened onClose={() => undefined} role="ADMIN" />,
    );
    await waitFor(() => view.getByText("Ver colaboradores"));
    assert.ok(view.getByText("Colaboradores"));
    assert.ok(view.getByText(/No puede gestionar usuarios/));
    assert.ok(getRoleCapabilitiesMock.mock.calls.length >= 1);
  });

  it("shows loading then success", async () => {
    let resolveAdmin!: (value: RoleCapabilities) => void;
    getRoleCapabilitiesMock.mock.mockImplementation(
      () =>
        new Promise<RoleCapabilities>((resolve) => {
          resolveAdmin = resolve;
        }),
    );
    const view = renderPage(
      <RolePermissionsDialog opened onClose={() => undefined} role="ADMIN" />,
    );
    await waitFor(() => view.getByText("Cargando permisos del rol..."));
    resolveAdmin(adminCapabilities);
    await waitFor(() => view.getByText("Ver colaboradores"));
  });

  it("shows error, retries with a new request, then succeeds", async () => {
    let calls = 0;
    getRoleCapabilitiesMock.mock.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("No se pudieron cargar los permisos del rol.");
      }
      return adminCapabilities;
    });
    const view = renderPage(
      <RolePermissionsDialog opened onClose={() => undefined} role="ADMIN" />,
    );
    await waitFor(() => view.getByText("No se pudieron cargar los permisos del rol."));
    fireEvent.click(view.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => view.getByText("Ver colaboradores"));
    assert.ok(calls >= 2);
  });

  it("shows empty permissions state", async () => {
    getRoleCapabilitiesMock.mock.mockImplementation(async () => ({
      ...adminCapabilities,
      permissions: [],
    }));
    const view = renderPage(
      <RolePermissionsDialog opened onClose={() => undefined} role="ADMIN" />,
    );
    await waitFor(() => view.getByText("Este rol no tiene permisos configurados."));
  });

  it("updates content on the same instance when role changes", async () => {
    const view = renderPage(<ControlledRolePermissionsDialog initialRole="ADMIN" />);
    await waitFor(() => view.getByText("Ver colaboradores"));
    fireEvent.click(view.getByRole("button", { name: "Cambiar a operador" }));
    await waitFor(() => view.getByText("Ver operaciones"));
    assert.equal(view.queryByText("Ver colaboradores"), null);
  });

  it("ignores a late ADMIN response after switching to OPERATOR", async () => {
    const resolvers: Partial<Record<string, (value: RoleCapabilities) => void>> = {};
    getRoleCapabilitiesMock.mock.mockImplementation(
      (_companyId: string, role: string) =>
        new Promise<RoleCapabilities>((resolve) => {
          resolvers[role] = resolve;
        }),
    );

    const view = renderPage(<ControlledRolePermissionsDialog initialRole="ADMIN" />);
    await waitFor(() => assert.ok(resolvers.ADMIN));
    fireEvent.click(view.getByRole("button", { name: "Cambiar a operador" }));
    await waitFor(() => assert.ok(resolvers.OPERATOR));

    resolvers.OPERATOR!(operatorCapabilities);
    await waitFor(() => view.getByText("Ver operaciones"));

    resolvers.ADMIN!(adminCapabilities);
    await waitFor(() => {
      assert.ok(view.getByText("Ver operaciones"));
      assert.equal(view.queryByText("Ver colaboradores"), null);
    });
  });

  it("does not fetch while the dialog is closed", () => {
    renderPage(<RolePermissionsDialog opened={false} role="ADMIN" />);
    assert.equal(getRoleCapabilitiesMock.mock.calls.length, 0);
  });
});

describe("RolePermissionsAction", () => {
  it("disables the action without a role", () => {
    const view = renderPage(<RolePermissionsAction role={null} />);
    const button = view.getByRole("button", { name: "Ver permisos del rol" });
    assert.equal((button as HTMLButtonElement).disabled, true);
  });

  it("opens the dialog for the selected role", async () => {
    const view = renderPage(<RolePermissionsAction role="ADMIN" />);
    fireEvent.click(view.getByRole("button", { name: "Ver permisos del rol" }));
    await waitFor(() => view.getByText("Ver colaboradores"));
  });

  it("invokes onClose from the footer button", async () => {
    let closed = false;
    const view = renderPage(
      <RolePermissionsDialog
        opened
        onClose={() => {
          closed = true;
        }}
        role="ADMIN"
      />,
    );
    await waitFor(() => view.getByText("Ver colaboradores"));
    const dialog = view.getByRole("dialog", { name: /Permisos del rol/ });
    const closeButtons = within(dialog).getAllByRole("button", { name: "Cerrar" });
    fireEvent.click(closeButtons[closeButtons.length - 1]!);
    assert.equal(closed, true);
  });
});

describe("CompanyUserDialog nested role permissions", () => {
  it("create flow: open permissions, close child via onClose path, keep parent, do not submit", async () => {
    mockViewport("desktop");
    let submitted = 0;
    const view = renderPage(
      <CompanyUserDialog
        open
        mode="create"
        assignableRoles={["ADMIN", "OPERATOR"]}
        onClose={() => undefined}
        onSubmit={() => {
          submitted += 1;
        }}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "Ver permisos del rol" }));
    await waitFor(() => view.getByRole("dialog", { name: /Permisos del rol/ }));
    assert.ok(getRoleCapabilitiesMock.mock.calls.some((call) => call.arguments[1] === "ADMIN"));

    const permissionsDialog = view.getByRole("dialog", { name: /Permisos del rol/ });
    const closeButtons = within(permissionsDialog).getAllByRole("button", { name: "Cerrar" });
    fireEvent.click(closeButtons[closeButtons.length - 1]!);
    // Parent invite form must remain; permissions title may animate out.
    assert.ok(view.getByText("Invitar usuario"));
    assert.equal(submitted, 0);
  });

  it("create flow: Escape on permissions dialog keeps the invite form", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <CompanyUserDialog
        open
        mode="create"
        assignableRoles={["ADMIN", "OPERATOR"]}
        onClose={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    fireEvent.click(view.getByRole("button", { name: "Ver permisos del rol" }));
    const permissionsDialog = await waitFor(() =>
      view.getByRole("dialog", { name: /Permisos del rol/ }),
    );
    fireEvent.keyDown(permissionsDialog, { key: "Escape", code: "Escape" });
    assert.ok(view.getByText("Invitar usuario"));
  });

  it("edit-like flow: change selected role without saving and consult new permissions", async () => {
    mockViewport("desktop");
    let submitted = 0;

    function EditLikeForm() {
      const [role, setRole] = useState<CompanyRole>("ADMIN");
      return (
        <div>
          <h1>Editar usuario</h1>
          <RoleSelectWithPermissions role={role}>
            <label>
              Rol en la empresa
              <select
                aria-label="Rol en la empresa"
                value={role}
                onChange={(event) => setRole(event.target.value as CompanyRole)}
              >
                <option value="ADMIN">Administrador</option>
                <option value="OPERATOR">Operador</option>
              </select>
            </label>
          </RoleSelectWithPermissions>
          <button
            type="button"
            onClick={() => {
              submitted += 1;
            }}
          >
            Guardar
          </button>
        </div>
      );
    }

    const view = renderPage(<EditLikeForm />);
    fireEvent.click(view.getByRole("button", { name: "Ver permisos del rol" }));
    await waitFor(() => view.getByText("Ver colaboradores"));
    const permissionsDialog = view.getByRole("dialog", { name: /Permisos del rol/ });
    const closeButtons = within(permissionsDialog).getAllByRole("button", { name: "Cerrar" });
    fireEvent.click(closeButtons[closeButtons.length - 1]!);

    fireEvent.change(view.getByRole("combobox", { name: /Rol en la empresa/i }), {
      target: { value: "OPERATOR" },
    });

    fireEvent.click(view.getByRole("button", { name: "Ver permisos del rol" }));
    await waitFor(() => view.getByText("Ver operaciones"));
    assert.ok(view.getByText("Editar usuario"));
    assert.equal(submitted, 0);
  });

  it("works on mobile viewport without closing the parent form", async () => {
    mockViewport("mobile");
    const view = renderPage(
      <CompanyUserDialog
        open
        mode="create"
        assignableRoles={["ADMIN", "OPERATOR"]}
        onClose={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    fireEvent.click(view.getByRole("button", { name: "Ver permisos del rol" }));
    await waitFor(() => view.getByRole("dialog", { name: /Permisos del rol/ }));
    const mobileDialog = view.getByRole("dialog", { name: /Permisos del rol/ });
    const mobileCloseButtons = within(mobileDialog).getAllByRole("button", { name: "Cerrar" });
    fireEvent.click(mobileCloseButtons[mobileCloseButtons.length - 1]!);
    assert.ok(view.getByText("Invitar usuario"));
  });
});
