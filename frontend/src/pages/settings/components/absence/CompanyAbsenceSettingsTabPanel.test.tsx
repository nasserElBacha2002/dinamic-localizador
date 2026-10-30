import { setupDomEnvironment } from "../../../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UseQueryResult } from "@tanstack/react-query";
import { afterEach, describe, it } from "node:test";
import React from "react";
import type { CompanyAbsenceSetting } from "../../../../types/company-absence-settings";
import type { CompanySettings } from "../../../../types/company-settings";
import type { AbsenceAttachmentStorageHealth } from "../../../../types/absence";
import type { CompanyWorkCalendar } from "../../../../types/absence-calendar";
import {
  clearActiveTestQueryClients,
  renderPage,
} from "../../../../test/render-page";
import {
  CompanyAbsenceSettingsTabPanel,
  type CompanyAbsenceTabDialogKey,
} from "./CompanyAbsenceSettingsTabPanel";

function querySuccess<T>(data: T): UseQueryResult<T, Error> {
  return {
    data,
    isLoading: false,
    isPending: false,
    isError: false,
    error: null,
    refetch: async () => ({}) as UseQueryResult<T, Error>,
  } as UseQueryResult<T, Error>;
}

const absenceSettings: CompanyAbsenceSetting[] = [
  {
    absenceTypeCode: "VACATION",
    absenceTypeName: "Vacaciones",
    isActive: true,
    defaultAnnualDays: 14,
    autoAssignOnEmployeeCreate: true,
  },
];

const calendar: CompanyWorkCalendar = {
  id: "cal-1",
  companyId: "co-1",
  name: "Calendario AR",
  isDefault: true,
  timezone: "America/Argentina/Buenos_Aires",
  isActive: true,
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  weekdays: [
    {
      id: "wd-1",
      companyId: "co-1",
      calendarId: "cal-1",
      dayOfWeek: 1,
      isWorkingDay: true,
      createdAt: "",
      updatedAt: "",
    },
  ],
};

const companySettings: CompanySettings = {
  companyId: "co-1",
  operationTimezone: "America/Argentina/Buenos_Aires",
  defaultRadiusMeters: 150,
  lateGraceMinutes: 15,
  earlyLeaveToleranceMinutes: 15,
  requireCheckoutLocation: true,
  allowManualAttendanceCorrections: false,
  defaultEarlyArrivalToleranceMinutes: 60,
  defaultLateArrivalToleranceMinutes: 15,
  defaultOperationStartTime: "08:00",
  defaultOperationEndTime: "17:00",
  geofenceReviewMarginMeters: 30,
  confirmationReminderEnabled: true,
  confirmationReminderHoursBefore: 24,
  pendingOperationExpirationHours: 12,
  adminAlertsEnabled: true,
  absenceAdvancedCalendarEnabled: false,
  absenceOperationalIntegrationEnabled: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const storageHealth: AbsenceAttachmentStorageHealth = {
  featureEnabled: true,
  storageConfigured: true,
  storageAvailable: true,
  message: null,
};

function renderPanel(options: {
  canUpdate?: boolean;
  onOpenDialog?: (key: CompanyAbsenceTabDialogKey) => void;
}) {
  const opened: CompanyAbsenceTabDialogKey[] = [];
  const onOpenDialog =
    options.onOpenDialog ??
    ((key: CompanyAbsenceTabDialogKey) => {
      opened.push(key);
    });

  const view = renderPage(
    <CompanyAbsenceSettingsTabPanel
      canUpdate={options.canUpdate ?? true}
      onOpenDialog={onOpenDialog}
      absenceSettingsQuery={querySuccess(absenceSettings)}
      absenceCalendarQuery={querySuccess(calendar)}
      settingsQuery={querySuccess(companySettings)}
      storageHealthQuery={querySuccess(storageHealth)}
    />,
  );

  return { view, opened, onOpenDialog };
}

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
});

describe("CompanyAbsenceSettingsTabPanel", () => {
  it("renders primary and advanced configuration sections", async () => {
    const { view } = renderPanel({});

    await waitFor(() => {
      assert.ok(view.getByText("Configuración principal"));
      assert.ok(view.getByText("Configuración avanzada"));
    });
    assert.ok(view.getByText("Tipos y saldos"));
    assert.ok(view.getByText("Políticas"));
    assert.equal(view.queryByText("Alertas de ausencias y cobertura"), null);
    assert.ok(view.getByText("Calendario laboral"));
    assert.ok(view.getByText("Vínculo con operaciones"));
  });

  it("opens saldos, policies and calendar flows from summary actions", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const opened: CompanyAbsenceTabDialogKey[] = [];
    const { view } = renderPanel({
      onOpenDialog: (key) => opened.push(key),
    });

    await waitFor(() => view.getByRole("button", { name: "Gestionar tipos y saldos" }));
    await user.click(view.getByRole("button", { name: "Gestionar tipos y saldos" }));
    await user.click(view.getByRole("button", { name: "Gestionar políticas" }));
    await user.click(view.getByRole("button", { name: "Gestionar calendario laboral" }));

    assert.deepEqual(opened, ["absences", "absenceTypePolicy", "absenceCalendar"]);
    assert.equal(
      view.queryByRole("button", { name: "Configurar alertas de ausencias y cobertura" }),
      null,
    );
  });

  it("hides edit actions when canUpdate is false", async () => {
    const { view } = renderPanel({ canUpdate: false });

    await waitFor(() => view.getByText("Tipos y saldos"));
    assert.equal(view.queryByRole("button", { name: "Gestionar tipos y saldos" }), null);
    assert.equal(view.queryByRole("button", { name: "Gestionar políticas" }), null);
    assert.equal(view.queryByRole("button", { name: "Gestionar calendario laboral" }), null);
    assert.equal(
      view.queryByRole("button", { name: /Mostrar diagnóstico de archivos adjuntos/i }),
      null,
    );
  });

  it("keeps attachment diagnostics collapsed by default", async () => {
    const { view } = renderPanel({});

    await waitFor(() =>
      assert.ok(view.getByRole("button", { name: /Mostrar diagnóstico de archivos adjuntos/i })),
    );
    assert.equal(view.queryByText("Archivos adjuntos"), null);
  });

  it("toggles attachment diagnostics visibility control", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const { view } = renderPanel({});

    const toggle = await waitFor(() =>
      view.getByRole("button", { name: /Mostrar diagnóstico de archivos adjuntos/i }),
    );
    assert.equal(toggle.getAttribute("aria-expanded"), "false");

    await user.click(toggle);
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    assert.ok(view.getByText("Archivos adjuntos"));
  });
});
