import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React, { useState } from "react";
import { MemoryRouter } from "react-router";
import { OperationForm } from "../../components/operations/OperationForm";
import { CompanyContext } from "../../context/company-context";
import type { OperationFormValues } from "../../schemas/operation.schema";
import type { CompanyMembershipSummary } from "../../types/company";
import { createDefaultWeeklySchedule } from "../../types/schedule";

const activeCompany = {
  companyId: "company-1",
  companyName: "Test Co",
  role: "ADMIN",
  isDefault: true,
  status: "ACTIVE",
} satisfies CompanyMembershipSummary;

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

const baseDefaults: OperationFormValues = {
  operationKind: "RECURRING",
  serviceId: "11111111-1111-4111-8111-111111111111",
  scheduledStart: "",
  scheduledEnd: "",
  validFrom: "2026-07-13",
  validUntil: "",
  scheduleSource: "COMPANY",
  scheduleDays: createDefaultWeeklySchedule("09:00", "18:00"),
  earlyToleranceMinutes: 60,
  lateToleranceMinutes: 15,
  notes: "",
  status: "SCHEDULED",
};

/**
 * Simulates OperationEditPage: new defaultValues object each parent render (e.g. onDirtyChange).
 * Uses a stable dirty callback like useUnsavedChangesController.setDirty.
 */
function EditDateHarness() {
  const [, setTick] = useState(0);
  const onDirtyChange = React.useCallback((_dirty: boolean) => {
    setTick((value) => value + 1);
  }, []);

  return (
    <OperationForm
      mode="edit"
      currentStatus="SCHEDULED"
      currentOperationKind="RECURRING"
      defaultValues={{ ...baseDefaults, scheduleDays: [...baseDefaults.scheduleDays] }}
      submitLabel="Guardar cambios"
      cancelTo="/operations/1"
      onDirtyChange={onDirtyChange}
      onSubmit={async () => {}}
    />
  );
}

function renderHarness() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <CompanyContext.Provider
        value={{
          companies: [activeCompany],
          activeCompany,
          isLoading: false,
          isReady: true,
          requiresSelection: false,
          hasNoCompanies: false,
          selectCompany: () => {},
          refreshCompanies: async () => {},
          clearActiveCompany: () => {},
        }}
      >
        <MemoryRouter>
          <MantineProvider>
            <EditDateHarness />
          </MantineProvider>
        </MemoryRouter>
      </CompanyContext.Provider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe("OperationForm edit date fields", () => {
  it("keeps edited Desde when parent re-renders with equal defaultValues", async () => {
    const view = renderHarness();
    const fromInput = view.container.querySelector(
      'input[type="date"][name="validFrom"]',
    ) as HTMLInputElement | null;

    assert.ok(fromInput);
    assert.equal(fromInput.value, "2026-07-13");

    fireEvent.change(fromInput, { target: { value: "2026-07-20" } });

    await waitFor(() => {
      const current = view.container.querySelector(
        'input[type="date"][name="validFrom"]',
      ) as HTMLInputElement | null;
      assert.ok(current);
      assert.equal(current.value, "2026-07-20");
    });
  });
});
