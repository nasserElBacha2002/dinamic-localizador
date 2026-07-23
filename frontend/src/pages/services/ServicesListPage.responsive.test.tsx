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
  SearchInput,
  StatusBadge,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
import { LocationMapCanvas } from "../../components/services/location-picker/components/LocationMapSection";
import { mockViewport } from "../../test/mock-match-media";
import type { Service } from "../../types/service";
import { activeStatusLabel } from "../../utils/labels";

const sample: Service = {
  id: "svc-1",
  name: "Sucursal Palermo",
  address: "Av. Santa Fe 1000",
  neighborhood: "Palermo",
  locality: "CABA",
  serviceFormat: "SUPER",
  latitude: -34.58,
  longitude: -58.42,
  allowedRadiusMeters: 150,
  active: true,
  googlePlaceId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function ServicesPilotHarness() {
  const [active, setActive] = useState("all");
  const [search, setSearch] = useState("");
  const activeFilterCount = active !== "all" ? 1 : 0;

  const columns = useMemo<DataTableColumn<Service>[]>(
    () => [
      { key: "name", header: "Nombre", getValue: (row) => row.name },
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

  const mobileCard = useMemo<DataTableMobileCardConfig<Service>>(
    () => ({
      title: (row) => row.name,
      subtitle: (row) => row.address ?? undefined,
      status: (row) => (
        <StatusBadge
          label={activeStatusLabel(row.active)}
          tone={row.active ? "success" : "neutral"}
        />
      ),
      fields: [
        {
          key: "locality",
          label: "Localidad",
          render: (row) => row.locality ?? "—",
          priority: "primary",
        },
        {
          key: "allowedRadiusMeters",
          label: "Radio",
          render: (row) => `${row.allowedRadiusMeters} m`,
          priority: "secondary",
        },
      ],
    }),
    [],
  );

  return (
    <>
      <ActionMenu
        primary={<Button>Nueva ubicación</Button>}
        menuLabel="Más acciones de servicios"
        items={[{ key: "import", label: "Importar servicios", onClick: () => undefined }]}
      />
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
              <option value="all">Todas</option>
              <option value="true">Activas</option>
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
        aria-label="Listado de servicios"
      />
    </>
  );
}

afterEach(() => {
  cleanup();
  mockViewport("desktop");
});

describe("Servicios responsive pilot contract", () => {
  it("renders desktop table", () => {
    mockViewport("desktop");
    const view = render(
      <MantineProvider>
        <MemoryRouter>
          <ServicesPilotHarness />
        </MemoryRouter>
      </MantineProvider>,
    );
    assert.ok(view.getByRole("table", { name: "Listado de servicios" }));
  });

  it("renders mobile cards without rigid filter minWidth and opens filters", async () => {
    mockViewport("mobile");
    const view = render(
      <MantineProvider>
        <MemoryRouter>
          <ServicesPilotHarness />
        </MemoryRouter>
      </MantineProvider>,
    );

    assert.equal(view.queryByRole("table"), null);
    assert.ok(view.getByRole("list", { name: "Listado de servicios" }));
    assert.ok(view.getByText("Sucursal Palermo"));
    assert.equal(view.container.innerHTML.includes("min-width: 360"), false);

    fireEvent.click(view.getByRole("button", { name: /^Filtros/ }));
    await waitFor(() => {
      assert.ok(within(document.body).getByLabelText("Estado"));
    });
  });

  it("shows map fallback when maps are unavailable", () => {
    const mapRef = { current: null };
    const view = render(
      <MantineProvider>
        <LocationMapCanvas
          mapContainerRef={mapRef}
          mapsLoadState="error"
          locationState="ERROR"
        />
      </MantineProvider>,
    );

    assert.ok(view.getByText(/Mapa no disponible/i));
    assert.ok(view.getByText(/coordenadas manualmente/i));
  });
});
