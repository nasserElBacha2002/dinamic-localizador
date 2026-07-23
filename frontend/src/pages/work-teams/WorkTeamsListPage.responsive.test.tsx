import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { Button, MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React, { useMemo, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import {
  DataTable,
  FilterBar,
  SearchInput,
  StatusBadge,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
import { mockViewport } from "../../test/mock-match-media";
import type { WorkTeam } from "../../types/work-team";

const sample: WorkTeam = {
  id: "team-1",
  companyId: "co-1",
  name: "Equipo Norte",
  description: "Turno mañana",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  memberCount: 4,
  activeMemberCount: 3,
};

function WorkTeamsPilotHarness() {
  const [active, setActive] = useState("all");
  const [search, setSearch] = useState("");
  const activeFilterCount = active !== "all" ? 1 : 0;

  const columns = useMemo<DataTableColumn<WorkTeam>[]>(
    () => [
      { key: "name", header: "Nombre", getValue: (row) => row.name },
      {
        key: "memberCount",
        header: "Integrantes",
        getValue: (row) => String(row.memberCount ?? 0),
      },
      {
        key: "isActive",
        header: "Estado",
        render: (row) => (
          <StatusBadge
            label={row.isActive ? "Activo" : "Inactivo"}
            tone={row.isActive ? "success" : "neutral"}
          />
        ),
      },
    ],
    [],
  );

  const mobileCard = useMemo<DataTableMobileCardConfig<WorkTeam>>(
    () => ({
      title: (row) => row.name,
      status: (row) => (
        <StatusBadge
          label={row.isActive ? "Activo" : "Inactivo"}
          tone={row.isActive ? "success" : "neutral"}
        />
      ),
      fields: [
        {
          key: "memberCount",
          label: "Integrantes",
          render: (row) => String(row.memberCount ?? 0),
          priority: "primary",
        },
      ],
    }),
    [],
  );

  return (
    <>
      <Button>Nuevo grupo</Button>
      <FilterBar
        search={
          <SearchInput value={search} onChange={setSearch} label="Buscar" onSearch={() => undefined} />
        }
        activeFilterCount={activeFilterCount}
        onClearFilters={() => setActive("all")}
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
      </FilterBar>
      <DataTable
        rows={[sample]}
        columns={columns}
        getRowKey={(row) => row.id}
        mobileView="cards"
        mobileCard={mobileCard}
        aria-label="Listado de grupos de trabajo"
      />
    </>
  );
}

afterEach(() => {
  cleanup();
  mockViewport("desktop");
});

describe("Equipos responsive pilot contract", () => {
  it("shows desktop table", () => {
    mockViewport("desktop");
    const view = render(
      <MantineProvider>
        <MemoryRouter>
          <WorkTeamsPilotHarness />
        </MemoryRouter>
      </MantineProvider>,
    );
    assert.ok(view.getByRole("table", { name: "Listado de grupos de trabajo" }));
    assert.ok(view.getByText("Equipo Norte"));
  });

  it("shows mobile cards with filters drawer and member count", async () => {
    mockViewport("mobile");
    const view = render(
      <MantineProvider>
        <MemoryRouter>
          <WorkTeamsPilotHarness />
        </MemoryRouter>
      </MantineProvider>,
    );

    assert.equal(view.queryByRole("table"), null);
    assert.ok(view.getByRole("list", { name: "Listado de grupos de trabajo" }));
    assert.ok(view.getByText("Equipo Norte"));
    assert.ok(view.getByText("4"));

    fireEvent.click(view.getByRole("button", { name: /^Filtros/ }));
    await waitFor(() => {
      assert.ok(within(document.body).getByLabelText("Estado"));
    });
  });
});
