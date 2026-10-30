import assert from "node:assert/strict";
import { mock } from "node:test";
import { describe, it } from "node:test";
import type { CompanySettings, UpdateCompanySettingsInput } from "../../../../types/company-settings";
import type { CompanyWorkSchedule } from "../../../../types/schedule";
import { createDefaultWeeklySchedule } from "../../../../types/schedule";
import {
  toOperationalSettingsFormValues,
  type OperationalSettingsFormValues,
} from "../../../../utils/company-settings-validation";
import {
  buildScheduleFormState,
  buildUnifiedDialogState,
  buildUnifiedSettingsUpdateInput,
  computeUnifiedSaveIntent,
  executeUnifiedSettingsSave,
  hasUnifiedPendingChanges,
  remoteTimezonesDiverged,
  shouldSyncLegacyDefaultOperationTimes,
  type ScheduleFormState,
} from "./company-operational-work-schedule-save";

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

function createState(overrides?: {
  operationalDraft?: Partial<OperationalSettingsFormValues>;
  scheduleDraft?: Partial<ScheduleFormState>;
}) {
  const operationalBaseline = toOperationalSettingsFormValues(settings);
  const scheduleBaseline = buildScheduleFormState(schedule);
  const formValues = { ...operationalBaseline, ...overrides?.operationalDraft };
  const scheduleDraft = {
    ...scheduleBaseline,
    ...overrides?.scheduleDraft,
    days: overrides?.scheduleDraft?.days ?? scheduleBaseline.days,
  };

  return {
    operationalBaseline,
    scheduleBaseline,
    formValues,
    scheduleDraft,
  };
}

describe("executeUnifiedSettingsSave", () => {
  it("returns noop without mutations when nothing changed", async () => {
    const state = createState();
    const settingsMutate = mock.fn(async () => settings);
    const scheduleMutate = mock.fn(async () => schedule);

    const outcome = await executeUnifiedSettingsSave({
      canUpdate: true,
      isSaving: false,
      formValues: state.formValues,
      operationalBaseline: state.operationalBaseline,
      scheduleDraft: state.scheduleDraft,
      scheduleBaseline: state.scheduleBaseline,
      isOperationalValid: true,
      settingsMutate,
      scheduleMutate,
      onSaved: () => undefined,
      onClose: () => undefined,
      setSubmitError: () => undefined,
      setOperationalBaseline: () => undefined,
      setFormValues: () => undefined,
      setScheduleBaseline: () => undefined,
      setScheduleDraft: () => undefined,
    });

    assert.equal(outcome, "noop");
    assert.equal(settingsMutate.mock.callCount(), 0);
    assert.equal(scheduleMutate.mock.callCount(), 0);
  });

  it("calls only settings mutation for operational changes", async () => {
    const state = createState({
      operationalDraft: { defaultRadiusMeters: "200" },
    });
    const settingsMutate = mock.fn(async (input: UpdateCompanySettingsInput) => ({
      ...settings,
      ...input,
    }));
    const scheduleMutate = mock.fn(async () => schedule);
    const onClose = mock.fn<() => void>();

    const outcome = await executeUnifiedSettingsSave({
      canUpdate: true,
      isSaving: false,
      formValues: state.formValues,
      operationalBaseline: state.operationalBaseline,
      scheduleDraft: state.scheduleDraft,
      scheduleBaseline: state.scheduleBaseline,
      isOperationalValid: true,
      settingsMutate,
      scheduleMutate,
      onSaved: () => undefined,
      onClose,
      setSubmitError: () => undefined,
      setOperationalBaseline: () => undefined,
      setFormValues: () => undefined,
      setScheduleBaseline: () => undefined,
      setScheduleDraft: () => undefined,
    });

    assert.equal(outcome, "closed");
    assert.equal(settingsMutate.mock.callCount(), 1);
    assert.equal(scheduleMutate.mock.callCount(), 0);
    assert.equal(settingsMutate.mock.calls[0]?.arguments[0]?.defaultRadiusMeters, 200);
    assert.equal(onClose.mock.callCount(), 1);
  });

  it("calls settings and schedule mutations when unified timezone changes", async () => {
    const state = createState({
      operationalDraft: { operationTimezone: "America/New_York" },
      scheduleDraft: { timezone: "America/New_York" },
    });
    const settingsMutate = mock.fn(async (input: UpdateCompanySettingsInput) => ({
      ...settings,
      ...input,
    }));
    const scheduleMutate = mock.fn(async () => ({
      ...schedule,
      timezone: "America/New_York",
    }));

    const outcome = await executeUnifiedSettingsSave({
      canUpdate: true,
      isSaving: false,
      formValues: state.formValues,
      operationalBaseline: state.operationalBaseline,
      scheduleDraft: state.scheduleDraft,
      scheduleBaseline: state.scheduleBaseline,
      isOperationalValid: true,
      settingsMutate,
      scheduleMutate,
      onSaved: () => undefined,
      onClose: () => undefined,
      setSubmitError: () => undefined,
      setOperationalBaseline: () => undefined,
      setFormValues: () => undefined,
      setScheduleBaseline: () => undefined,
      setScheduleDraft: () => undefined,
    });

    assert.equal(outcome, "closed");
    assert.equal(settingsMutate.mock.callCount(), 1);
    assert.equal(scheduleMutate.mock.callCount(), 1);
    assert.equal(settingsMutate.mock.calls[0]?.arguments[0]?.operationTimezone, "America/New_York");
    assert.equal(scheduleMutate.mock.calls[0]?.arguments[0]?.timezone, "America/New_York");
  });

  it("syncs legacy default operation times when uniform weekly schedule changes", async () => {
    const uniformDays = createDefaultWeeklySchedule("21:00", "04:00");
    const state = createState({
      scheduleDraft: { days: uniformDays },
    });
    const settingsMutate = mock.fn(async (input: UpdateCompanySettingsInput) => ({
      ...settings,
      ...input,
    }));
    const scheduleMutate = mock.fn(async () => ({
      ...schedule,
      days: uniformDays,
    }));

    const outcome = await executeUnifiedSettingsSave({
      canUpdate: true,
      isSaving: false,
      formValues: state.formValues,
      operationalBaseline: state.operationalBaseline,
      scheduleDraft: state.scheduleDraft,
      scheduleBaseline: state.scheduleBaseline,
      isOperationalValid: true,
      settingsMutate,
      scheduleMutate,
      onSaved: () => undefined,
      onClose: () => undefined,
      setSubmitError: () => undefined,
      setOperationalBaseline: () => undefined,
      setFormValues: () => undefined,
      setScheduleBaseline: () => undefined,
      setScheduleDraft: () => undefined,
    });

    assert.equal(outcome, "closed");
    assert.equal(settingsMutate.mock.callCount(), 1);
    assert.equal(scheduleMutate.mock.callCount(), 1);
    assert.equal(settingsMutate.mock.calls[0]?.arguments[0]?.defaultOperationStartTime, "21:00");
    assert.equal(settingsMutate.mock.calls[0]?.arguments[0]?.defaultOperationEndTime, "04:00");
  });

  it("does not overwrite legacy defaults when weekly schedule is not uniform", async () => {
    const mixedDays = createDefaultWeeklySchedule("20:30", "03:00").map((day) =>
      day.dayOfWeek === "FRIDAY"
        ? { ...day, startTime: "21:00", endTime: "04:00" }
        : day,
    );
    const state = createState({
      scheduleDraft: { days: mixedDays },
    });
    const settingsMutate = mock.fn(async () => settings);
    const scheduleMutate = mock.fn(async () => ({
      ...schedule,
      days: mixedDays,
    }));

    const outcome = await executeUnifiedSettingsSave({
      canUpdate: true,
      isSaving: false,
      formValues: state.formValues,
      operationalBaseline: state.operationalBaseline,
      scheduleDraft: state.scheduleDraft,
      scheduleBaseline: state.scheduleBaseline,
      isOperationalValid: true,
      settingsMutate,
      scheduleMutate,
      onSaved: () => undefined,
      onClose: () => undefined,
      setSubmitError: () => undefined,
      setOperationalBaseline: () => undefined,
      setFormValues: () => undefined,
      setScheduleBaseline: () => undefined,
      setScheduleDraft: () => undefined,
    });

    assert.equal(outcome, "closed");
    assert.equal(settingsMutate.mock.callCount(), 0);
    assert.equal(scheduleMutate.mock.callCount(), 1);
    assert.equal(shouldSyncLegacyDefaultOperationTimes(
      state.scheduleDraft,
      state.scheduleBaseline,
      state.operationalBaseline,
    ), false);
  });

  it("calls only schedule mutation for schedule-only day toggles with unchanged legacy defaults", async () => {
    const daysWithSaturday = createDefaultWeeklySchedule("20:30", "03:00").map((day) =>
      day.dayOfWeek === "SATURDAY"
        ? { ...day, isEnabled: true, startTime: "20:30", endTime: "03:00" }
        : day,
    );
    const state = createState({
      scheduleDraft: { days: daysWithSaturday },
    });
    const settingsMutate = mock.fn(async () => settings);
    const scheduleMutate = mock.fn(async () => ({
      ...schedule,
      days: daysWithSaturday,
    }));

    const outcome = await executeUnifiedSettingsSave({
      canUpdate: true,
      isSaving: false,
      formValues: state.formValues,
      operationalBaseline: state.operationalBaseline,
      scheduleDraft: state.scheduleDraft,
      scheduleBaseline: state.scheduleBaseline,
      isOperationalValid: true,
      settingsMutate,
      scheduleMutate,
      onSaved: () => undefined,
      onClose: () => undefined,
      setSubmitError: () => undefined,
      setOperationalBaseline: () => undefined,
      setFormValues: () => undefined,
      setScheduleBaseline: () => undefined,
      setScheduleDraft: () => undefined,
    });

    assert.equal(outcome, "closed");
    assert.equal(settingsMutate.mock.callCount(), 0);
    assert.equal(scheduleMutate.mock.callCount(), 1);
  });

  it("persists both domains once and closes on full success", async () => {
    const state = createState({
      operationalDraft: { defaultRadiusMeters: "200" },
      scheduleDraft: {
        timezone: "America/New_York",
      },
    });
    state.formValues.operationTimezone = "America/New_York";
    state.scheduleDraft.timezone = "America/New_York";
    const settingsMutate = mock.fn(async (input: UpdateCompanySettingsInput) => ({
      ...settings,
      ...input,
    }));
    const scheduleMutate = mock.fn(async () => ({
      ...schedule,
      timezone: "America/New_York",
    }));
    const onSaved = mock.fn<(message: string) => void>();
    const onClose = mock.fn<() => void>();

    const outcome = await executeUnifiedSettingsSave({
      canUpdate: true,
      isSaving: false,
      formValues: state.formValues,
      operationalBaseline: state.operationalBaseline,
      scheduleDraft: state.scheduleDraft,
      scheduleBaseline: state.scheduleBaseline,
      isOperationalValid: true,
      settingsMutate,
      scheduleMutate,
      onSaved,
      onClose,
      setSubmitError: () => undefined,
      setOperationalBaseline: () => undefined,
      setFormValues: () => undefined,
      setScheduleBaseline: () => undefined,
      setScheduleDraft: () => undefined,
    });

    assert.equal(outcome, "closed");
    assert.equal(settingsMutate.mock.callCount(), 1);
    assert.equal(scheduleMutate.mock.callCount(), 1);
    assert.equal(onSaved.mock.callCount(), 1);
    assert.equal(onClose.mock.callCount(), 1);
  });

  it("returns partial without global success when operational fails and schedule succeeds", async () => {
    const state = createState({
      operationalDraft: { defaultRadiusMeters: "200" },
      scheduleDraft: { timezone: "America/New_York" },
    });
    state.formValues.operationTimezone = "America/New_York";
    state.scheduleDraft.timezone = "America/New_York";
    const settingsMutate = mock.fn(async () => {
      throw new Error("operational failed");
    });
    const scheduleMutate = mock.fn(async () => ({
      ...schedule,
      timezone: "America/New_York",
    }));
    const onSaved = mock.fn<(message: string) => void>();
    const onClose = mock.fn<() => void>();
    let submitError = "";
    const setScheduleBaseline = mock.fn<(value: ScheduleFormState) => void>();
    const setScheduleDraft = mock.fn<(value: ScheduleFormState) => void>();

    const outcome = await executeUnifiedSettingsSave({
      canUpdate: true,
      isSaving: false,
      formValues: state.formValues,
      operationalBaseline: state.operationalBaseline,
      scheduleDraft: state.scheduleDraft,
      scheduleBaseline: state.scheduleBaseline,
      isOperationalValid: true,
      settingsMutate,
      scheduleMutate,
      onSaved,
      onClose,
      setSubmitError: (message) => {
        submitError = message ?? "";
      },
      setOperationalBaseline: () => undefined,
      setFormValues: () => undefined,
      setScheduleBaseline,
      setScheduleDraft,
    });

    assert.equal(outcome, "partial");
    assert.equal(onSaved.mock.callCount(), 0);
    assert.equal(onClose.mock.callCount(), 0);
    assert.match(submitError, /Configuración operativa:/);
    assert.match(submitError, /horario laboral semanal se guardó/i);
    assert.equal(setScheduleBaseline.mock.callCount(), 1);
    assert.equal(setScheduleDraft.mock.callCount(), 1);
  });

  it("returns partial without global success when schedule fails and operational succeeds", async () => {
    const state = createState({
      operationalDraft: { defaultRadiusMeters: "200" },
      scheduleDraft: { timezone: "America/New_York" },
    });
    state.formValues.operationTimezone = "America/New_York";
    state.scheduleDraft.timezone = "America/New_York";
    const settingsMutate = mock.fn(async (input: UpdateCompanySettingsInput) => ({
      ...settings,
      ...input,
    }));
    const scheduleMutate = mock.fn(async () => {
      throw new Error("schedule failed");
    });
    const onSaved = mock.fn<(message: string) => void>();
    const onClose = mock.fn<() => void>();
    let submitError = "";
    const setOperationalBaseline = mock.fn<(value: OperationalSettingsFormValues) => void>();
    const setFormValues = mock.fn<(value: OperationalSettingsFormValues) => void>();

    const outcome = await executeUnifiedSettingsSave({
      canUpdate: true,
      isSaving: false,
      formValues: state.formValues,
      operationalBaseline: state.operationalBaseline,
      scheduleDraft: state.scheduleDraft,
      scheduleBaseline: state.scheduleBaseline,
      isOperationalValid: true,
      settingsMutate,
      scheduleMutate,
      onSaved,
      onClose,
      setSubmitError: (message) => {
        submitError = message ?? "";
      },
      setOperationalBaseline,
      setFormValues,
      setScheduleBaseline: () => undefined,
      setScheduleDraft: () => undefined,
    });

    assert.equal(outcome, "partial");
    assert.equal(onSaved.mock.callCount(), 0);
    assert.equal(onClose.mock.callCount(), 0);
    assert.match(submitError, /Horario laboral semanal:/);
    assert.match(submitError, /configuración operativa se guardó/i);
    assert.equal(setOperationalBaseline.mock.callCount(), 1);
    assert.equal(setFormValues.mock.callCount(), 1);
  });

  it("retries only schedule after operational baseline promotion", async () => {
    const state = createState({
      operationalDraft: { defaultRadiusMeters: "200" },
      scheduleDraft: { timezone: "America/New_York" },
    });
    state.formValues.operationTimezone = "America/New_York";
    state.scheduleDraft.timezone = "America/New_York";
    const settingsMutate = mock.fn(async (input: UpdateCompanySettingsInput) => ({
      ...settings,
      ...input,
    }));
    const scheduleMutate = mock.fn(async () => {
      throw new Error("schedule failed");
    });

    let operationalBaseline = state.operationalBaseline;
    let formValues = state.formValues;
    let scheduleBaseline = state.scheduleBaseline;
    let scheduleDraft = state.scheduleDraft;

    const runSave = async () =>
      executeUnifiedSettingsSave({
        canUpdate: true,
        isSaving: false,
        formValues,
        operationalBaseline,
        scheduleDraft,
        scheduleBaseline,
        isOperationalValid: true,
        settingsMutate,
        scheduleMutate,
        onSaved: () => undefined,
        onClose: () => undefined,
        setSubmitError: () => undefined,
        setOperationalBaseline: (value) => {
          operationalBaseline = value;
        },
        setFormValues: (value) => {
          formValues = value;
        },
        setScheduleBaseline: (value) => {
          scheduleBaseline = value;
        },
        setScheduleDraft: (value) => {
          scheduleDraft = value;
        },
      });

    assert.equal(await runSave(), "partial");
    assert.equal(settingsMutate.mock.callCount(), 1);
    assert.equal(scheduleMutate.mock.callCount(), 1);

    scheduleMutate.mock.mockImplementation(async () => ({
      ...schedule,
      timezone: "America/New_York",
    }));

    assert.equal(await runSave(), "closed");
    assert.equal(settingsMutate.mock.callCount(), 1);
    assert.equal(scheduleMutate.mock.callCount(), 2);
  });

  it("retries only operational after schedule baseline promotion", async () => {
    const state = createState({
      operationalDraft: { defaultRadiusMeters: "200" },
      scheduleDraft: { timezone: "America/New_York" },
    });
    state.formValues.operationTimezone = "America/New_York";
    state.scheduleDraft.timezone = "America/New_York";
    const settingsMutate = mock.fn(async () => {
      throw new Error("operational failed");
    });
    const scheduleMutate = mock.fn(async () => ({
      ...schedule,
      timezone: "America/New_York",
    }));

    let operationalBaseline = state.operationalBaseline;
    let formValues = state.formValues;
    let scheduleBaseline = state.scheduleBaseline;
    let scheduleDraft = state.scheduleDraft;

    const runSave = async () =>
      executeUnifiedSettingsSave({
        canUpdate: true,
        isSaving: false,
        formValues,
        operationalBaseline,
        scheduleDraft,
        scheduleBaseline,
        isOperationalValid: true,
        settingsMutate,
        scheduleMutate,
        onSaved: () => undefined,
        onClose: () => undefined,
        setSubmitError: () => undefined,
        setOperationalBaseline: (value) => {
          operationalBaseline = value;
        },
        setFormValues: (value) => {
          formValues = value;
        },
        setScheduleBaseline: (value) => {
          scheduleBaseline = value;
        },
        setScheduleDraft: (value) => {
          scheduleDraft = value;
        },
      });

    assert.equal(await runSave(), "partial");
    assert.equal(settingsMutate.mock.callCount(), 1);
    assert.equal(scheduleMutate.mock.callCount(), 1);

    settingsMutate.mock.mockImplementation(async (input: UpdateCompanySettingsInput) => ({
      ...settings,
      ...input,
    }));

    assert.equal(await runSave(), "closed");
    assert.equal(settingsMutate.mock.callCount(), 2);
    assert.equal(scheduleMutate.mock.callCount(), 1);
  });
});

describe("buildUnifiedSettingsUpdateInput", () => {
  it("derives legacy defaults only when syncLegacyDefaults is true", () => {
    const state = createState({
      scheduleDraft: { days: createDefaultWeeklySchedule("21:00", "04:00") },
    });

    const synced = buildUnifiedSettingsUpdateInput(
      state.formValues,
      state.scheduleDraft,
      true,
    );
    assert.equal(synced.defaultOperationStartTime, "21:00");
    assert.equal(synced.defaultOperationEndTime, "04:00");

    const notSynced = buildUnifiedSettingsUpdateInput(
      state.formValues,
      state.scheduleDraft,
      false,
    );
    assert.equal(notSynced.defaultOperationStartTime, "20:30");
    assert.equal(notSynced.defaultOperationEndTime, "03:00");
  });
});

describe("computeUnifiedSaveIntent", () => {
  it("detects pending changes across operational, timezone and schedule domains", () => {
    const state = createState();
    assert.equal(
      computeUnifiedSaveIntent(
        state.formValues,
        state.operationalBaseline,
        state.scheduleDraft,
        state.scheduleBaseline,
      ).hasChanges,
      false,
    );

    const radiusChange = createState({ operationalDraft: { defaultRadiusMeters: "200" } });
    assert.equal(
      computeUnifiedSaveIntent(
        radiusChange.formValues,
        radiusChange.operationalBaseline,
        radiusChange.scheduleDraft,
        radiusChange.scheduleBaseline,
      ).needsSettingsSave,
      true,
    );
  });
});

describe("buildUnifiedDialogState timezone reconciliation", () => {
  it("keeps real baselines and does not mark dirty when remote timezones match", () => {
    const aligned = buildUnifiedDialogState(settings, schedule);

    assert.equal(
      aligned.operationalBaseline.operationTimezone,
      "America/Argentina/Buenos_Aires",
    );
    assert.equal(aligned.scheduleBaseline.timezone, "America/Argentina/Buenos_Aires");
    assert.equal(
      hasUnifiedPendingChanges(
        aligned.formValues,
        aligned.operationalBaseline,
        aligned.scheduleDraft,
        aligned.scheduleBaseline,
      ),
      false,
    );
  });

  it("detects divergent remote timezones while exposing a single draft timezone", () => {
    const divergentSchedule: CompanyWorkSchedule = {
      ...schedule,
      timezone: "America/New_York",
    };
    const state = buildUnifiedDialogState(settings, divergentSchedule);

    assert.equal(state.operationalBaseline.operationTimezone, "America/Argentina/Buenos_Aires");
    assert.equal(state.scheduleBaseline.timezone, "America/New_York");
    assert.equal(state.formValues.operationTimezone, "America/Argentina/Buenos_Aires");
    assert.equal(state.scheduleDraft.timezone, "America/Argentina/Buenos_Aires");
    assert.equal(remoteTimezonesDiverged(state.operationalBaseline, state.scheduleBaseline), true);
    assert.equal(
      hasUnifiedPendingChanges(
        state.formValues,
        state.operationalBaseline,
        state.scheduleDraft,
        state.scheduleBaseline,
      ),
      true,
    );
  });

  it("marks radius-only edits with divergent remote timezones as requiring schedule reconciliation", () => {
    const divergentSchedule: CompanyWorkSchedule = {
      ...schedule,
      timezone: "America/New_York",
    };
    const state = buildUnifiedDialogState(settings, divergentSchedule);
    const formValues = { ...state.formValues, defaultRadiusMeters: "200" };
    const intent = computeUnifiedSaveIntent(
      formValues,
      state.operationalBaseline,
      state.scheduleDraft,
      state.scheduleBaseline,
    );

    assert.equal(intent.needsSettingsSave, true);
    assert.equal(intent.hasScheduleChanges, true);
  });
});

describe("legacy default sync guards", () => {
  it("does not sync legacy defaults from an invalid weekly schedule draft", () => {
    const invalidDays = createDefaultWeeklySchedule("20:30", "03:00").map((day) =>
      day.dayOfWeek === "MONDAY" ? { ...day, endTime: null } : day,
    );
    const state = createState({
      scheduleDraft: { days: invalidDays },
    });

    assert.equal(
      shouldSyncLegacyDefaultOperationTimes(
        state.scheduleDraft,
        state.scheduleBaseline,
        state.operationalBaseline,
      ),
      false,
    );
  });
});

describe("executeUnifiedSettingsSave legacy schedule ordering", () => {
  it("does not PATCH legacy defaults when schedule fails, then retries schedule only", async () => {
    const uniformDays = createDefaultWeeklySchedule("21:00", "04:00");
    const state = createState({
      scheduleDraft: { days: uniformDays },
    });
    const settingsMutate = mock.fn(async (input: UpdateCompanySettingsInput) => ({
      ...settings,
      ...input,
    }));
    const scheduleMutate = mock.fn(async () => {
      throw new Error("schedule failed");
    });

    let operationalBaseline = state.operationalBaseline;
    let formValues = state.formValues;
    let scheduleBaseline = state.scheduleBaseline;
    let scheduleDraft = state.scheduleDraft;

    const runSave = async () =>
      executeUnifiedSettingsSave({
        canUpdate: true,
        isSaving: false,
        formValues,
        operationalBaseline,
        scheduleDraft,
        scheduleBaseline,
        isOperationalValid: true,
        settingsMutate,
        scheduleMutate,
        onSaved: () => undefined,
        onClose: () => undefined,
        setSubmitError: () => undefined,
        setOperationalBaseline: (value) => {
          operationalBaseline = value;
        },
        setFormValues: (value) => {
          formValues = value;
        },
        setScheduleBaseline: (value) => {
          scheduleBaseline = value;
        },
        setScheduleDraft: (value) => {
          scheduleDraft = value;
        },
      });

    assert.equal(await runSave(), "partial");
    assert.equal(settingsMutate.mock.callCount(), 0);
    assert.equal(scheduleMutate.mock.callCount(), 1);

    scheduleMutate.mock.mockImplementation(async () => ({
      ...schedule,
      days: uniformDays,
    }));

    assert.equal(await runSave(), "closed");
    assert.equal(settingsMutate.mock.callCount(), 1);
    assert.equal(scheduleMutate.mock.callCount(), 2);
    assert.equal(settingsMutate.mock.calls[0]?.arguments[0]?.defaultOperationStartTime, "21:00");
    assert.equal(settingsMutate.mock.calls[0]?.arguments[0]?.defaultOperationEndTime, "04:00");
  });
});

describe("executeUnifiedSettingsSave validation guard", () => {
  it("skips settings mutation when operational data is invalid", async () => {
    const state = createState({
      operationalDraft: { defaultRadiusMeters: "5" },
    });
    const settingsMutate = mock.fn(async () => settings);
    const scheduleMutate = mock.fn(async () => schedule);

    const outcome = await executeUnifiedSettingsSave({
      canUpdate: true,
      isSaving: false,
      formValues: state.formValues,
      operationalBaseline: state.operationalBaseline,
      scheduleDraft: state.scheduleDraft,
      scheduleBaseline: state.scheduleBaseline,
      isOperationalValid: false,
      settingsMutate,
      scheduleMutate,
      onSaved: () => undefined,
      onClose: () => undefined,
      setSubmitError: () => undefined,
      setOperationalBaseline: () => undefined,
      setFormValues: () => undefined,
      setScheduleBaseline: () => undefined,
      setScheduleDraft: () => undefined,
    });

    assert.equal(outcome, "noop");
    assert.equal(settingsMutate.mock.callCount(), 0);
    assert.equal(scheduleMutate.mock.callCount(), 0);
  });
});
