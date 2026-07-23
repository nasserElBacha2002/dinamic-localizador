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
  StatusBadge,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
import { mockViewport } from "../../test/mock-match-media";
import type { OperationWithService } from "../../types/operation";
import { operationStatusLabels } from "../../utils/labels";

const sample = {
  id: "op-1",
  status: "SCHEDULED",
  operationKind: "ONE_TIME",
  scheduledStart: "2026-07-25T12:00:00.000Z",
  scheduledEnd: "2026-07-25T18:00:00.000Z",
  earlyToleranceMinutes: 15,
  lateToleranceMinutes: 10,
  service: { name: "Sucursal Centro", address: "Av. Corrientes 1234" },
} as unknown as OperationWithService;

function OperationsPilotHarness({ onOpenDetail }: { onOpenDetail?: () => void }) {
  const [status, setStatus] = useState("");
  const activeFilterCount = status ? 1 : 0;

  const columns = useMemo<DataTableColumn<OperationWithService>[]>(
    () => [
      {
        key: "serviceName",
        header: "Servicio",
        getValue: (row) => row.service?.name ?? "—",
      },
      {
        key: "status",
        header: "Estado",
        render: (row) => (
          <StatusBadge label={operationStatusLabels[row.status]} tone="info" variant="light" />
        ),
      },
    ],
    [],
  );

  const mobileCard = useMemo<DataTableMobileCardConfig<OperationWithService>>(
    () => ({
      title: (row) => row.service?.name ?? "Operación",
      subtitle: (row) => row.service?.address ?? undefined,
      status: (row) => (
        <StatusBadge label={operationStatusLabels[row.status]} tone="info" variant="light" />
      ),
      fields: [
        {
          key: "address",
          label: "Dirección",
          render: (row) => row.service?.address ?? "—",
          priority: "primary",
        },
      ],
    }),
    [],
  );

  return (
    <>
      <ActionMenu
        primary={<Button>Nueva operación</Button>}
        menuLabel="Más acciones de operaciones"
        items={[{ key: "import", label: "Importar operaciones", onClick: () => undefined }]}
      />
      <FilterBar
        activeFilterCount={activeFilterCount}
        onClearFilters={() => setStatus("")}
      >
        <FilterBar.Item>
          <label>
            Estado
            <select
              aria-label="Estado"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">Todos</option>
              <option value="SCHEDULED">Programada</option>
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
        onRowClick={() => onOpenDetail?.()}
        aria-label="Listado de operaciones"
      />
    </>
  );
}

afterEach(() => {
  cleanup();
  mockViewport("desktop");
});

describe("Operaciones responsive pilot contract", () => {
  it("renders desktop table without card list", () => {
    mockViewport("desktop");
    const view = render(
      <MantineProvider>
        <MemoryRouter>
          <OperationsPilotHarness />
        </MemoryRouter>
      </MantineProvider>,
    );
    assert.ok(view.getByRole("table", { name: "Listado de operaciones" }));
    assert.equal(view.queryByRole("list", { name: "Listado de operaciones" }), null);
  });

  it("renders mobile cards, filter drawer, actions and detail navigation", async () => {
    mockViewport("mobile");
    let opened = 0;
    const view = render(
      <MantineProvider>
        <MemoryRouter>
          <OperationsPilotHarness onOpenDetail={() => {
            opened += 1;
          }} />
        </MemoryRouter>
      </MantineProvider>,
    );

    assert.equal(view.queryByRole("table"), null);
    assert.ok(view.getByRole("list", { name: "Listado de operaciones" }));
    assert.ok(view.getByText("Sucursal Centro"));

    fireEvent.click(view.getByRole("button", { name: /^Filtros/ }));
    await waitFor(() => {
      assert.ok(within(document.body).getByLabelText("Estado"));
    });
    fireEvent.click(within(document.body).getByRole("button", { name: "Ver resultados" }));

    fireEvent.click(view.getByRole("button", { name: "Más acciones de operaciones" }));
    assert.ok(view.getByRole("menuitem", { name: "Importar operaciones" }));

    fireEvent.click(view.getByText("Sucursal Centro"));
    assert.equal(opened, 1);
  });
});
