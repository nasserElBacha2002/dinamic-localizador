import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CompanySettings } from "../../types/company-settings";
import type { CompanyWorkSchedule } from "../../types/schedule";
import { createDefaultWeeklySchedule } from "../../types/schedule";
import { buildOperationalAndWorkScheduleCardSummary } from "./company-settings-summaries";
import {
  buildUnifiedDialogState,
  hasUnifiedPendingChanges,
  remoteTimezonesDiverged,
} from "./components/schedule/company-operational-work-schedule-save";

const settings: CompanySettings = {
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

const schedule: CompanyWorkSchedule = {
  id: "schedule-1",
  companyId: "company-1",
  timezone: "America/Argentina/Buenos_Aires",
  version: 1,
  days: createDefaultWeeklySchedule("20:30", "03:00"),
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("buildOperationalAndWorkScheduleCardSummary", () => {
  it("shows a single timezone and weekly schedule without scalar default hours", () => {
    const summary = buildOperationalAndWorkScheduleCardSummary(settings, schedule);
    const labels = summary.summaryItems.map((item) => item.label);

    assert.equal(labels.filter((label) => label === "Zona horaria").length, 1);
    assert.equal(labels.includes("Horario predeterminado"), false);
    assert.ok(labels.includes("Horario"));
    assert.ok(labels.includes("Días laborables"));
    assert.ok(labels.includes("Radio permitido"));
  });
});

describe("Unified operational/work schedule timezone reconciliation", () => {
  it("does not create artificial pending changes when remote timezones match", () => {
    const state = buildUnifiedDialogState(settings, schedule);
    assert.equal(
      hasUnifiedPendingChanges(
        state.formValues,
        state.operationalBaseline,
        state.scheduleDraft,
        state.scheduleBaseline,
      ),
      false,
    );
  });

  it("detects historical timezone divergence without overwriting schedule baseline", () => {
    const divergentSchedule = { ...schedule, timezone: "America/New_York" };
    const state = buildUnifiedDialogState(settings, divergentSchedule);

    assert.equal(state.scheduleBaseline.timezone, "America/New_York");
    assert.equal(state.operationalBaseline.operationTimezone, "America/Argentina/Buenos_Aires");
    assert.equal(remoteTimezonesDiverged(state.operationalBaseline, state.scheduleBaseline), true);
    assert.equal(state.scheduleDraft.timezone, "America/Argentina/Buenos_Aires");
  });
});
