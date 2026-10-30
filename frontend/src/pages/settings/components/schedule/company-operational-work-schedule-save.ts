import { getCanonicalOperationTimezone } from "../../../../constants/operation-timezones";
import type { CompanySettings } from "../../../../types/company-settings";
import type { CompanyWorkSchedule, WeeklyScheduleDay } from "../../../../types/schedule";
import {
  toOperationalSettingsFormValues,
  toOperationalSettingsUpdateInput,
  type OperationalSettingsFormValues,
} from "../../../../utils/company-settings-validation";
import { getApiErrorMessage } from "../../../../utils/errors";
import { extractUniformWeeklyScheduleTimes } from "../../../../utils/uniform-weekly-schedule-times";
import { isWeeklyScheduleDraftValid } from "../../../../utils/weekly-schedule-validation";
import { weeklyScheduleDaysEqual } from "../../../../utils/weekly-schedule-days-equal";

export interface ScheduleFormState {
  timezone: string;
  days: WeeklyScheduleDay[];
}

export function scheduleStatesEqual(left: ScheduleFormState, right: ScheduleFormState): boolean {
  return (
    getCanonicalOperationTimezone(left.timezone) ===
      getCanonicalOperationTimezone(right.timezone) &&
    weeklyScheduleDaysEqual(left.days, right.days)
  );
}

export function buildScheduleFormState(schedule: CompanyWorkSchedule): ScheduleFormState {
  return {
    timezone: schedule.timezone,
    days: schedule.days,
  };
}

export type UnifiedSettingsSaveOutcome = "noop" | "closed" | "partial";

export function remoteTimezonesDiverged(
  operationalBaseline: OperationalSettingsFormValues,
  scheduleBaseline: ScheduleFormState,
): boolean {
  return (
    getCanonicalOperationTimezone(operationalBaseline.operationTimezone) !==
    getCanonicalOperationTimezone(scheduleBaseline.timezone)
  );
}

/** Settings operationTimezone is the unified timezone authority for save/reconcile. */
export function buildUnifiedDialogState(
  settings: CompanySettings,
  schedule: CompanyWorkSchedule,
): {
  operationalBaseline: OperationalSettingsFormValues;
  scheduleBaseline: ScheduleFormState;
  formValues: OperationalSettingsFormValues;
  scheduleDraft: ScheduleFormState;
} {
  const operationalBaseline = toOperationalSettingsFormValues(settings);
  const scheduleBaseline = buildScheduleFormState(schedule);
  const authorityTimezone = getCanonicalOperationTimezone(operationalBaseline.operationTimezone);
  const diverged = remoteTimezonesDiverged(operationalBaseline, scheduleBaseline);

  const formValues = operationalBaseline;
  const scheduleDraft: ScheduleFormState = {
    ...scheduleBaseline,
    timezone: diverged ? authorityTimezone : scheduleBaseline.timezone,
  };

  return {
    operationalBaseline,
    scheduleBaseline,
    formValues,
    scheduleDraft,
  };
}

export function operationalVisibleSettingsEqual(
  left: OperationalSettingsFormValues,
  right: OperationalSettingsFormValues,
): boolean {
  return (
    left.defaultRadiusMeters === right.defaultRadiusMeters &&
    left.defaultEarlyArrivalToleranceMinutes === right.defaultEarlyArrivalToleranceMinutes &&
    left.defaultLateArrivalToleranceMinutes === right.defaultLateArrivalToleranceMinutes &&
    left.earlyLeaveToleranceMinutes === right.earlyLeaveToleranceMinutes &&
    left.pendingOperationExpirationHours === right.pendingOperationExpirationHours &&
    left.confirmationReminderEnabled === right.confirmationReminderEnabled &&
    left.confirmationReminderHoursBefore === right.confirmationReminderHoursBefore
  );
}

export function settingsTimezoneChanged(
  formValues: OperationalSettingsFormValues,
  operationalBaseline: OperationalSettingsFormValues,
): boolean {
  return (
    getCanonicalOperationTimezone(formValues.operationTimezone) !==
    getCanonicalOperationTimezone(operationalBaseline.operationTimezone)
  );
}

export function shouldSyncLegacyDefaultOperationTimes(
  scheduleDraft: ScheduleFormState,
  _scheduleBaseline: ScheduleFormState,
  operationalBaseline: OperationalSettingsFormValues,
): boolean {
  if (!isWeeklyScheduleDraftValid(scheduleDraft.days)) {
    return false;
  }

  const uniform = extractUniformWeeklyScheduleTimes(scheduleDraft.days);
  if (!uniform) {
    return false;
  }

  return (
    operationalBaseline.defaultOperationStartTime !== uniform.startTime ||
    operationalBaseline.defaultOperationEndTime !== uniform.endTime
  );
}

export function buildUnifiedSettingsUpdateInput(
  formValues: OperationalSettingsFormValues,
  scheduleDraft: ScheduleFormState,
  syncLegacyDefaults: boolean,
) {
  const input = toOperationalSettingsUpdateInput(formValues);
  input.operationTimezone = getCanonicalOperationTimezone(formValues.operationTimezone);

  if (syncLegacyDefaults) {
    const uniform = extractUniformWeeklyScheduleTimes(scheduleDraft.days);
    if (uniform) {
      input.defaultOperationStartTime = uniform.startTime;
      input.defaultOperationEndTime = uniform.endTime;
    }
  }

  return input;
}

export interface UnifiedSettingsSaveParams {
  canUpdate: boolean;
  isSaving: boolean;
  formValues: OperationalSettingsFormValues;
  operationalBaseline: OperationalSettingsFormValues;
  scheduleDraft: ScheduleFormState;
  scheduleBaseline: ScheduleFormState;
  isOperationalValid: boolean;
  settingsMutate: (
    input: ReturnType<typeof toOperationalSettingsUpdateInput>,
  ) => Promise<CompanySettings>;
  scheduleMutate: (input: {
    timezone: string;
    days: WeeklyScheduleDay[];
  }) => Promise<CompanyWorkSchedule>;
  onSaved: (message: string) => void;
  onClose: () => void;
  setSubmitError: (message: string | null) => void;
  setOperationalBaseline: (values: OperationalSettingsFormValues) => void;
  setFormValues: (values: OperationalSettingsFormValues) => void;
  setScheduleBaseline: (state: ScheduleFormState) => void;
  setScheduleDraft: (state: ScheduleFormState) => void;
}

export function computeUnifiedSaveIntent(
  formValues: OperationalSettingsFormValues,
  operationalBaseline: OperationalSettingsFormValues,
  scheduleDraft: ScheduleFormState,
  scheduleBaseline: ScheduleFormState,
) {
  const hasScheduleChanges = !scheduleStatesEqual(scheduleDraft, scheduleBaseline);
  const visibleOperationalChanged = !operationalVisibleSettingsEqual(
    formValues,
    operationalBaseline,
  );
  const timezoneChangedForSettings = settingsTimezoneChanged(formValues, operationalBaseline);
  const legacyDefaultsSync = shouldSyncLegacyDefaultOperationTimes(
    scheduleDraft,
    scheduleBaseline,
    operationalBaseline,
  );
  const needsSettingsSave =
    visibleOperationalChanged || timezoneChangedForSettings || legacyDefaultsSync;
  const hasChanges = needsSettingsSave || hasScheduleChanges;

  return {
    needsSettingsSave,
    hasScheduleChanges,
    hasChanges,
    legacyDefaultsSync,
    scheduleFirst: legacyDefaultsSync && hasScheduleChanges,
  };
}

export async function executeUnifiedSettingsSave(
  params: UnifiedSettingsSaveParams,
): Promise<UnifiedSettingsSaveOutcome> {
  const { needsSettingsSave, hasScheduleChanges, hasChanges, legacyDefaultsSync, scheduleFirst } =
    computeUnifiedSaveIntent(
      params.formValues,
      params.operationalBaseline,
      params.scheduleDraft,
      params.scheduleBaseline,
    );

  if (!params.canUpdate || params.isSaving || !hasChanges) {
    return "noop";
  }

  if (needsSettingsSave && !params.isOperationalValid) {
    return "noop";
  }

  params.setSubmitError(null);

  const failureMessages: string[] = [];
  let operationalSaved = false;
  let scheduleSaved = false;

  const runScheduleSave = async (): Promise<void> => {
    if (!hasScheduleChanges) {
      return;
    }

    try {
      const updatedSchedule = await params.scheduleMutate({
        timezone: getCanonicalOperationTimezone(params.scheduleDraft.timezone),
        days: params.scheduleDraft.days,
      });
      const promotedSchedule = buildScheduleFormState(updatedSchedule);
      params.setScheduleBaseline(promotedSchedule);
      params.setScheduleDraft(promotedSchedule);
      scheduleSaved = true;
    } catch (error) {
      failureMessages.push(`Horario laboral semanal: ${getApiErrorMessage(error)}`);
    }
  };

  const runSettingsSave = async (): Promise<void> => {
    if (!needsSettingsSave) {
      return;
    }

    try {
      const updatedSettings = await params.settingsMutate(
        buildUnifiedSettingsUpdateInput(
          params.formValues,
          params.scheduleDraft,
          legacyDefaultsSync,
        ),
      );
      const promotedOperational = toOperationalSettingsFormValues(updatedSettings);
      params.setOperationalBaseline(promotedOperational);
      params.setFormValues(promotedOperational);
      operationalSaved = true;
    } catch (error) {
      failureMessages.push(`Configuración operativa: ${getApiErrorMessage(error)}`);
    }
  };

  if (scheduleFirst) {
    await runScheduleSave();
    if (scheduleSaved) {
      await runSettingsSave();
    } else if (needsSettingsSave && !legacyDefaultsSync) {
      await runSettingsSave();
    }
  } else {
    await runSettingsSave();
    await runScheduleSave();
  }

  if (failureMessages.length === 0) {
    if (operationalSaved && scheduleSaved) {
      params.onSaved("Configuración operativa y horario laboral guardados correctamente.");
    } else if (operationalSaved) {
      params.onSaved("Configuración operativa guardada correctamente.");
    } else if (scheduleSaved) {
      params.onSaved("Horario laboral semanal guardado correctamente.");
    }
    params.onClose();
    return "closed";
  }

  const savedParts: string[] = [];
  if (operationalSaved) {
    savedParts.push("La configuración operativa se guardó correctamente.");
  }
  if (scheduleSaved) {
    savedParts.push("El horario laboral semanal se guardó correctamente.");
  }

  params.setSubmitError([...failureMessages, ...savedParts].join(" "));
  return "partial";
}

export function shouldConfirmDiscardPendingChanges(hasChanges: boolean): boolean {
  return hasChanges;
}

export function hasUnifiedPendingChanges(
  formValues: OperationalSettingsFormValues,
  operationalBaseline: OperationalSettingsFormValues,
  scheduleDraft: ScheduleFormState,
  scheduleBaseline: ScheduleFormState,
): boolean {
  const hasScheduleChanges = !scheduleStatesEqual(scheduleDraft, scheduleBaseline);
  const visibleOperationalChanged = !operationalVisibleSettingsEqual(
    formValues,
    operationalBaseline,
  );
  const timezoneChangedForSettings = settingsTimezoneChanged(formValues, operationalBaseline);
  const legacyDefaultsSync = shouldSyncLegacyDefaultOperationTimes(
    scheduleDraft,
    scheduleBaseline,
    operationalBaseline,
  );

  return (
    visibleOperationalChanged ||
    timezoneChangedForSettings ||
    legacyDefaultsSync ||
    hasScheduleChanges
  );
}
