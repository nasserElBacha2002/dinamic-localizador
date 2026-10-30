import { setupDomEnvironment } from "../../../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { mock } from "node:test";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import React from "react";
import type { CompanySettings } from "../../../../types/company-settings";
import type { CompanyWorkSchedule } from "../../../../types/schedule";
import { createDefaultWeeklySchedule } from "../../../../types/schedule";
import { installLayoutPolyfills } from "../../../../test/layout-polyfills";
import { clearActiveTestQueryClients, renderPage } from "../../../../test/render-page";

installLayoutPolyfills();

const baseSettings: CompanySettings = {
  companyId: "company-1",
  operationTimezone: "America/Argentina/Buenos_Aires",
  defaultRadiusMeters: 180,
  lateGraceMinutes: 15,
  earlyLeaveToleranceMinutes: 15,
  requireCheckoutLocation: true,
  allowManualAttendanceCorrections: false,
  defaultEarlyArrivalToleranceMinutes: 60,
  defaultLateArrivalToleranceMinutes: 15,
  defaultOperationStartTime: "20:30",
  defaultOperationEndTime: "03:00",
  geofenceReviewMarginMeters: 30,
  confirmationReminderEnabled: true,
  confirmationReminderHoursBefore: 24,
  pendingOperationExpirationHours: 12,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const baseSchedule: CompanyWorkSchedule = {
  id: "schedule-1",
  companyId: "company-1",
  timezone: "America/Argentina/Buenos_Aires",
  version: 1,
  days: createDefaultWeeklySchedule("20:30", "03:00"),
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const settingsMutate = mock.fn(async () => baseSettings);
const scheduleMutate = mock.fn(async () => baseSchedule);

mock.module("../../../../hooks/useCompanySettings", {
  namedExports: {
    useUpdateCompanySettings: () => ({
      isPending: false,
      mutateAsync: settingsMutate,
    }),
  },
});

mock.module("../../../../hooks/useCompanyWorkSchedule", {
  namedExports: {
    useUpdateCompanyWorkSchedule: () => ({
      isPending: false,
      mutateAsync: scheduleMutate,
    }),
  },
});

let CompanyOperationalAndWorkScheduleDialog: typeof import("./CompanyOperationalAndWorkScheduleDialog").CompanyOperationalAndWorkScheduleDialog;

before(async () => {
  ({ CompanyOperationalAndWorkScheduleDialog } = await import(
    "./CompanyOperationalAndWorkScheduleDialog"
  ));
});

beforeEach(() => {
  setupDomEnvironment();
  settingsMutate.mock.resetCalls();
  scheduleMutate.mock.resetCalls();
  settingsMutate.mock.mockImplementation(async () => baseSettings);
  scheduleMutate.mock.mockImplementation(async () => baseSchedule);
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
});

function renderDialog(onClose: () => void = () => undefined) {
  return renderPage(
    React.createElement(CompanyOperationalAndWorkScheduleDialog, {
      opened: true,
      onClose,
      settings: baseSettings,
      schedule: baseSchedule,
      canUpdate: true,
      onSaved: () => undefined,
    }),
  );
}

describe("CompanyOperationalAndWorkScheduleDialog UI", () => {
  it("renders a single integrated form without legacy default time inputs", async () => {
    const view = renderDialog();

    assert.ok(await view.findByText("Configuración operativa y horario laboral"));
    assert.equal(view.queryByLabelText("Horario de inicio por defecto"), null);
    assert.equal(view.queryByLabelText("Horario de fin por defecto"), null);
    assert.equal(view.queryByText("Configuración operativa", { selector: "h5" }), null);
    assert.equal(view.queryByText("Horario laboral semanal", { selector: "h5" }), null);

    const timezoneInputs = view.getAllByRole("combobox", {
      name: "Zona horaria operativa",
    });
    assert.equal(timezoneInputs.length, 1);
    assert.ok(await view.findByRole("checkbox", { name: "Lunes" }));

    const saveButton = view.getByRole("button", { name: "Guardar configuración" });
    assert.equal(saveButton.hasAttribute("disabled"), true);
  });

  it("persists schedule-only edits without settings mutation when legacy defaults stay valid", async () => {
    const view = renderDialog();

    fireEvent.click(await view.findByRole("checkbox", { name: "Sábado" }));
    fireEvent.click(view.getByRole("button", { name: "Guardar configuración" }));

    await waitFor(() => assert.equal(scheduleMutate.mock.callCount(), 1));
    assert.equal(settingsMutate.mock.callCount(), 0);
  });

  it("asks for confirmation before closing with pending schedule changes", async () => {
    const confirmMock = mock.fn(() => false);
    window.confirm = confirmMock as typeof confirm;
    const onClose = mock.fn<() => void>();
    const view = renderDialog(onClose);

    fireEvent.click(await view.findByRole("checkbox", { name: "Sábado" }));
    await waitFor(() =>
      assert.equal(
        view.getByRole("button", { name: "Guardar configuración" }).hasAttribute("disabled"),
        false,
      ),
    );
    fireEvent.click(view.getByRole("button", { name: "Cancelar" }));

    assert.equal(confirmMock.mock.callCount(), 1);
    assert.equal(onClose.mock.callCount(), 0);
  });
});
