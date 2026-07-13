import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { OperationForm } from "../../components/operations/OperationForm";
import { CompanyContext } from "../../context/company-context";
import type { CompanySettings } from "../../types/company-settings";
import type { CompanyWorkSchedule } from "../../types/schedule";
import type { CompanyMembershipSummary } from "../../types/company";
import { buildOperationCreateDefaultValues } from "../../utils/operation-create-defaults";

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

function renderForm(props: Partial<React.ComponentProps<typeof OperationForm>> = {}) {
  const settings = {
    companyId: "company-1",
    operationTimezone: "America/Argentina/Buenos_Aires",
    defaultRadiusMeters: 150,
    lateGraceMinutes: 90,
    earlyLeaveToleranceMinutes: 30,
    requireCheckoutLocation: true,
    allowManualAttendanceCorrections: true,
    defaultEarlyArrivalToleranceMinutes: 15,
    defaultLateArrivalToleranceMinutes: 20,
    defaultOperationStartTime: "09:00",
    defaultOperationEndTime: "18:00",
    geofenceReviewMarginMeters: 30,
    confirmationReminderEnabled: true,
    confirmationReminderHoursBefore: 24,
    pendingOperationExpirationHours: 12,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } satisfies CompanySettings;

  const defaultValues = buildOperationCreateDefaultValues(settings);

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
            <OperationForm
              mode="create"
              defaultValues={defaultValues}
              submitLabel="Crear operación"
              cancelTo="/operations"
              onSubmit={async () => {}}
              {...props}
            />
          </MantineProvider>
        </MemoryRouter>
      </CompanyContext.Provider>
    </QueryClientProvider>,
  );
}

const companyWorkSchedule: CompanyWorkSchedule = {
  id: "cws-1",
  companyId: "company-1",
  timezone: "America/Argentina/Buenos_Aires",
  version: 1,
  days: buildOperationCreateDefaultValues({
    companyId: "company-1",
    operationTimezone: "America/Argentina/Buenos_Aires",
    defaultRadiusMeters: 150,
    lateGraceMinutes: 90,
    earlyLeaveToleranceMinutes: 30,
    requireCheckoutLocation: true,
    allowManualAttendanceCorrections: true,
    defaultEarlyArrivalToleranceMinutes: 15,
    defaultLateArrivalToleranceMinutes: 20,
    defaultOperationStartTime: "09:00",
    defaultOperationEndTime: "18:00",
    geofenceReviewMarginMeters: 30,
    confirmationReminderEnabled: true,
    confirmationReminderHoursBefore: 24,
    pendingOperationExpirationHours: 12,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }).scheduleDays.map((day) => ({
    ...day,
    startTime: day.isEnabled ? "09:00" : null,
    endTime: day.isEnabled ? "18:00" : null,
  })),
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

afterEach(() => {
  cleanup();
});

describe("OperationForm recurring create review fixes", () => {
  it("shows missing company schedule message and settings link", () => {
    const view = renderForm({
      companyWorkSchedule: null,
      companyWorkScheduleLoading: false,
    });

    fireEvent.click(view.getByText("Trabajo habitual"));
    assert.ok(
      view.getByText("La empresa no tiene un horario laboral semanal configurado."),
    );
    assert.ok(view.getByText("Configurar horario de la empresa"));
  });

  it("renders company schedule preview when schedule exists", () => {
    const view = renderForm({
      companyWorkSchedule,
      companyWorkScheduleLoading: false,
    });

    fireEvent.click(view.getByText("Trabajo habitual"));
    fireEvent.click(view.getByText("Usar horario de la empresa"));
    assert.ok(view.getByText("Horario de la empresa"));
    assert.ok(view.getAllByText("09:00–18:00").length >= 1);
  });

  it("shows custom schedule editor when selecting horario específico", () => {
    const view = renderForm({
      companyWorkSchedule: null,
      companyWorkScheduleLoading: false,
    });

    fireEvent.click(view.getByText("Trabajo habitual"));
    fireEvent.click(view.getByText("Configurar horario específico"));
    assert.ok(view.getByLabelText("Lunes"));
  });
});
