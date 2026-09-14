/**
 * Dialog smoke tests: company context + DOM env required for Mantine/React under tsx.
 */
import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CompanyContext } from "../../context/company-context";
import type { WhatsAppQuotaSettings } from "../../types/whatsapp-quota-settings";

const settings = (): WhatsAppQuotaSettings => ({
  companyId: "c1",
  globalMode: "OFF",
  companyMode: "SHADOW",
  effectiveMode: "OFF",
  effectiveModeReason: "GLOBAL_MODE_OFF",
  timezoneId: "America/Argentina/Buenos_Aires",
  dailyTurns: 20,
  weeklyTurns: 60,
  burstTurns: 5,
  burstWindowSeconds: 60,
  dailyOutbounds: 40,
  weeklyOutbounds: 120,
  companyDailyOutbounds: 500,
  limitNoticeEnabled: true,
  updatedAt: "2026-09-14T12:00:00.000Z",
  updatedBy: null,
  limits: {
    maxDailyTurns: 10000,
    maxWeeklyTurns: 50000,
    maxBurstTurns: 1000,
    minBurstWindowSeconds: 1,
    maxBurstWindowSeconds: 3600,
    maxDailyOutbounds: 20000,
    maxWeeklyOutbounds: 100000,
    maxCompanyDailyOutbounds: 500000,
  },
  shadowSummary: {
    windowDays: 7,
    turnsEvaluated: 10,
    wouldAdmit: 8,
    wouldReject: 2,
    rejectReasons: { BLOCKED_DAILY_TURNS: 2 },
    employeesAffected: 3,
    outboundWouldReject: 1,
    lastShadowEventAt: "2026-09-14T10:00:00.000Z",
  },
});

const membership = {
  companyId: "c1",
  companyName: "Test Co",
  role: "ADMIN",
  isDefault: true,
  status: "ACTIVE",
};

const companyValue = {
  companies: [membership],
  activeCompany: membership,
  isLoading: false,
  isReady: true,
  requiresSelection: false,
  hasNoCompanies: false,
  selectCompany: () => undefined,
  refreshCompanies: async () => undefined,
  clearActiveCompany: () => undefined,
};

let CompanyWhatsAppQuotaSettingsDialog: typeof import("./components/CompanyWhatsAppQuotaSettingsDialog").CompanyWhatsAppQuotaSettingsDialog;

before(async () => {
  ({ CompanyWhatsAppQuotaSettingsDialog } = await import(
    "./components/CompanyWhatsAppQuotaSettingsDialog"
  ));
});

beforeEach(() => {
  setupDomEnvironment();
});

afterEach(() => {
  cleanup();
});

function renderDialog(data: WhatsAppQuotaSettings) {
  const client = new QueryClient();
  return render(
    React.createElement(
      CompanyContext.Provider,
      { value: companyValue },
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(
          MantineProvider,
          null,
          React.createElement(CompanyWhatsAppQuotaSettingsDialog, {
            opened: true,
            onClose: () => undefined,
            settings: data,
            canUpdate: true,
            onSaved: () => undefined,
          }),
        ),
      ),
    ),
  );
}

describe("CompanyWhatsAppQuotaSettingsDialog", () => {
  it("renders mode/global/effective and shadow summary from backend values", () => {
    const view = renderDialog(settings());
    assert.ok(view.getByText("Cuotas de WhatsApp"));
    assert.ok(view.getByText(/Modo global:/i));
    assert.ok(view.getByText(/Modo efectivo:/i));
    assert.ok(view.getByText(/El modo global del servidor está en OFF/i));
    assert.ok(view.getByText(/Resumen SHADOW/i));
    assert.ok(view.getByText(/Would admit: 8/i));
    assert.ok(view.getByText("America/Argentina/Buenos_Aires"));
  });

  it("shows effective-not-ENFORCE hint when company ENFORCE and global OFF", () => {
    const data = { ...settings(), companyMode: "ENFORCE" as const };
    const view = renderDialog(data);
    assert.ok(view.getByText(/modo efectivo no será ENFORCE/i));
  });
});
