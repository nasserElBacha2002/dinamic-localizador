import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { Button, MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React, { useMemo, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import {
  ActionMenu,
  DataTable,
  FilterBar,
  ResponsiveModal,
  SearchInput,
  StatusBadge,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
import { mockViewport } from "../../test/mock-match-media";
import type { Employee } from "../../types/employee";
import { activeStatusLabel, employeeTypeLabels } from "../../utils/labels";

/**
 * Smoke composition mirroring EmployeesListPage responsive contract:
 * same DataTable/FilterBar/ActionMenu/ResponsiveModal wiring, shared state, no dual trees.
 */
const sample: Employee = {
  id: "emp-1",
  name: "Ada Lovelace",
  documentNumber: "30111222",
  phoneNumber: "+5491112345678",
  employeeType: "INTERNAL",
  active: true,
  categoryId: "cat-1",
  category: { id: "cat-1", name: "Operaciones", isSystem: false, isActive: true },
  lastWorkedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function EmployeesPilotHarness({
  onOpenDialog,
}: {
  onOpenDialog?: () => void;
}) {
  const [active, setActive] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const activeFilterCount =
    (active !== "all" ? 1 : 0) + (categoryId !== "all" ? 1 : 0);

  const columns = useMemo<DataTableColumn<Employee>[]>(
    () => [
      { key: "name", header: "Nombre", getValue: (row) => row.name },
      { key: "phoneNumber", header: "Teléfono", getValue: (row) => row.phoneNumber },
      {
        key: "active",
        header: "Estado",
        render: (row) => (
          <StatusBadge
            label={activeStatusLabel(row.active)}
            tone={row.active ? "success" : "neutral"}
          />
        ),
      },
    ],
    [],
  );

  const mobileCard = useMemo<DataTableMobileCardConfig<Employee>>(
    () => ({
      title: (row) => row.name,
      status: (row) => (
        <StatusBadge
          label={activeStatusLabel(row.active)}
          tone={row.active ? "success" : "neutral"}
        />
      ),
      fields: [
        {
          key: "phoneNumber",
          label: "Teléfono",
          render: (row) => row.phoneNumber,
          priority: "primary",
        },
        {
          key: "category",
          label: "Categoría",
          render: (row) => row.category?.name ?? "—",
          priority: "primary",
        },
        {
          key: "employeeType",
          label: "Tipo",
          render: (row) => employeeTypeLabels[row.employeeType],
          priority: "primary",
        },
      ],
    }),
    [],
  );

  return (
    <>
      <ActionMenu
        primary={<Button>Nuevo colaborador</Button>}
        menuLabel="Más acciones de colaboradores"
        items={[
          {
            key: "import",
            label: "Importar colaboradores",
            onClick: () => undefined,
          },
          {
            key: "deactivate",
            label: "Desactivar",
            destructive: true,
            onClick: () => {
              setDialogOpen(true);
              onOpenDialog?.();
            },
          },
        ]}
      />

      <FilterBar
        search={
          <SearchInput
            value={search}
            onChange={setSearch}
            onSearch={() => undefined}
            placeholder="Nombre, documento o teléfono"
            label="Buscar"
          />
        }
        activeFilterCount={activeFilterCount}
        onClearFilters={() => {
          setActive("all");
          setCategoryId("all");
        }}
      >
        <FilterBar.Item>
          <label>
            Estado
            <select
              aria-label="Estado"
              value={active}
              onChange={(event) => setActive(event.target.value)}
            >
              <option value="all">Todos</option>
              <option value="true">Activos</option>
            </select>
          </label>
        </FilterBar.Item>
        <FilterBar.Item>
          <label>
            Categoría
            <select
              aria-label="Categoría"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="all">Todas</option>
              <option value="cat-1">Operaciones</option>
            </select>
          </label>
        </FilterBar.Item>
      </FilterBar>

      <DataTable
        rows={[sample]}
        columns={columns}
        getRowKey={(row) => row.id}
        mobileView="cards"
        mobileCard={mobileCard}
        aria-label="Listado de colaboradores"
      />

      <ResponsiveModal
        opened={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Desactivar colaborador"
        withinPortal={false}
        footer={<Button onClick={() => setDialogOpen(false)}>Cerrar</Button>}
      >
        Confirmar desactivación de {sample.name}
      </ResponsiveModal>
    </>
  );
}

afterEach(() => {
  cleanup();
  mockViewport("desktop");
});

describe("Colaboradores responsive pilot contract", () => {
  it("shows a desktop table (not an interactive card list)", () => {
    mockViewport("desktop");
    const view = render(
      <MantineProvider>
        <MemoryRouter>
          <EmployeesPilotHarness />
        </MemoryRouter>
      </MantineProvider>,
    );

    assert.ok(view.getByRole("table", { name: "Listado de colaboradores" }));
    assert.equal(view.queryByRole("list", { name: "Listado de colaboradores" }), null);
    assert.ok(view.getByText("Ada Lovelace"));
  });

  it("shows mobile cards, filter drawer, actions, and responsive dialog without a desktop table", async () => {
    mockViewport("mobile");
    let dialogOpened = 0;

    const view = render(
      <MantineProvider>
        <MemoryRouter>
          <EmployeesPilotHarness
            onOpenDialog={() => {
              dialogOpened += 1;
            }}
          />
        </MemoryRouter>
      </MantineProvider>,
    );

    assert.equal(view.queryByRole("table"), null);
    assert.ok(view.getByRole("list", { name: "Listado de colaboradores" }));
    assert.ok(view.getByLabelText("Buscar"));

    fireEvent.click(view.getByRole("button", { name: /^Filtros/ }));
    await waitFor(() => {
      assert.ok(view.getByRole("dialog", { name: "Filtros" }));
    });
    fireEvent.click(view.getByRole("button", { name: "Ver resultados" }));

    fireEvent.click(view.getByRole("button", { name: "Más acciones de colaboradores" }));
    fireEvent.click(view.getByRole("menuitem", { name: "Desactivar" }));
    assert.equal(dialogOpened, 1);
    await waitFor(() => {
      assert.ok(within(document.body).getByText(/Confirmar desactivación/));
    });
  });
});
