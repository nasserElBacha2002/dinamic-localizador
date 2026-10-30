import { Select, Stack } from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getCanonicalOperationTimezone,
  getOperationTimezoneOptions,
} from "../../../../constants/operation-timezones";
import { useUpdateCompanySettings } from "../../../../hooks/useCompanySettings";
import { useUpdateCompanyWorkSchedule } from "../../../../hooks/useCompanyWorkSchedule";
import type { CompanySettings } from "../../../../types/company-settings";
import type { CompanyWorkSchedule } from "../../../../types/schedule";
import {
  validateOperationalSettingsForm,
  type OperationalSettingsFormValues,
} from "../../../../utils/company-settings-validation";
import { SettingsDialog } from "../SettingsDialog";
import { SettingsFormField } from "../SettingsFormField";
import {
  buildUnifiedDialogState,
  computeUnifiedSaveIntent,
  executeUnifiedSettingsSave,
  hasUnifiedPendingChanges,
  remoteTimezonesDiverged,
  type ScheduleFormState,
} from "./company-operational-work-schedule-save";
import { CompanyWeeklyScheduleDialogContent } from "./CompanyWeeklyScheduleDialogContent";
import { OperationalSettingsForm } from "./OperationalSettingsForm";

interface CompanyOperationalAndWorkScheduleDialogProps {
  opened: boolean;
  onClose: () => void;
  settings: CompanySettings;
  schedule: CompanyWorkSchedule;
  canUpdate: boolean;
  onSaved: (message: string) => void;
}

export function CompanyOperationalAndWorkScheduleDialog({
  opened,
  onClose,
  settings,
  schedule,
  canUpdate,
  onSaved,
}: CompanyOperationalAndWorkScheduleDialogProps) {
  const settingsMutation = useUpdateCompanySettings();
  const scheduleMutation = useUpdateCompanyWorkSchedule();

  const [operationalBaseline, setOperationalBaseline] = useState<OperationalSettingsFormValues>(
    () => buildUnifiedDialogState(settings, schedule).operationalBaseline,
  );
  const [formValues, setFormValues] = useState<OperationalSettingsFormValues>(
    () => buildUnifiedDialogState(settings, schedule).formValues,
  );
  const [scheduleBaseline, setScheduleBaseline] = useState<ScheduleFormState>(
    () => buildUnifiedDialogState(settings, schedule).scheduleBaseline,
  );
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleFormState>(
    () => buildUnifiedDialogState(settings, schedule).scheduleDraft,
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const lastSettingsUpdatedAtRef = useRef(settings.updatedAt);
  const lastScheduleUpdatedAtRef = useRef(schedule.updatedAt);

  const timezoneOptions = useMemo(
    () => getOperationTimezoneOptions(formValues.operationTimezone),
    [formValues.operationTimezone],
  );

  const applyUnifiedTimezone = (timezone: string) => {
    const canonical = getCanonicalOperationTimezone(timezone);
    setFormValues((current) => ({ ...current, operationTimezone: canonical }));
    setScheduleDraft((current) => ({ ...current, timezone: canonical }));
  };

  useEffect(() => {
    const remote = buildUnifiedDialogState(settings, schedule);
    const settingsVersionChanged = settings.updatedAt !== lastSettingsUpdatedAtRef.current;
    const scheduleVersionChanged = schedule.updatedAt !== lastScheduleUpdatedAtRef.current;
    const hasLocalEdits = hasUnifiedPendingChanges(
      formValues,
      operationalBaseline,
      scheduleDraft,
      scheduleBaseline,
    );

    if (settingsVersionChanged || scheduleVersionChanged) {
      if (settingsVersionChanged) {
        lastSettingsUpdatedAtRef.current = settings.updatedAt;
      }
      if (scheduleVersionChanged) {
        lastScheduleUpdatedAtRef.current = schedule.updatedAt;
      }

      if (!hasLocalEdits) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sync remote props without clobbering pending local edits
        setOperationalBaseline(remote.operationalBaseline);
        setFormValues(remote.formValues);
        setScheduleBaseline(remote.scheduleBaseline);
        setScheduleDraft(remote.scheduleDraft);
      }
    }
  }, [
    settings,
    schedule,
    formValues,
    operationalBaseline,
    scheduleDraft,
    scheduleBaseline,
  ]);

  const validationErrors = validateOperationalSettingsForm(formValues);

  const hasChanges = hasUnifiedPendingChanges(
    formValues,
    operationalBaseline,
    scheduleDraft,
    scheduleBaseline,
  );

  const { needsSettingsSave } = computeUnifiedSaveIntent(
    formValues,
    operationalBaseline,
    scheduleDraft,
    scheduleBaseline,
  );

  const isOperationalValid = validationErrors.length === 0;
  const isSaving = settingsMutation.isPending || scheduleMutation.isPending;
  const disabled = !canUpdate || isSaving;

  const resetDraftsToBaseline = () => {
    setFormValues(operationalBaseline);
    setScheduleDraft(
      remoteTimezonesDiverged(operationalBaseline, scheduleBaseline)
        ? {
            ...scheduleBaseline,
            timezone: getCanonicalOperationTimezone(operationalBaseline.operationTimezone),
          }
        : scheduleBaseline,
    );
    setSubmitError(null);
  };

  const discardAndClose = () => {
    resetDraftsToBaseline();
    onClose();
  };

  const handleClose = () => {
    if (isSaving) {
      return;
    }

    if (hasChanges) {
      const confirmed = window.confirm(
        "Hay cambios sin guardar. ¿Querés cerrar y descartarlos?",
      );
      if (!confirmed) {
        return;
      }
    }

    discardAndClose();
  };

  const handleSave = async () => {
    await executeUnifiedSettingsSave({
      canUpdate,
      isSaving,
      formValues,
      operationalBaseline,
      scheduleDraft,
      scheduleBaseline,
      isOperationalValid,
      settingsMutate: (input) => settingsMutation.mutateAsync(input),
      scheduleMutate: (input) => scheduleMutation.mutateAsync(input),
      onSaved,
      onClose,
      setSubmitError,
      setOperationalBaseline,
      setFormValues,
      setScheduleBaseline,
      setScheduleDraft,
    });
  };

  const saveDisabled =
    !canUpdate ||
    !hasChanges ||
    isSaving ||
    (needsSettingsSave && !isOperationalValid);

  return (
    <SettingsDialog
      opened={opened}
      onClose={handleClose}
      title="Configuración operativa y horario laboral"
      subtitle="Parámetros operativos, tolerancias y horario semanal predeterminado de la empresa."
      onSave={handleSave}
      saving={isSaving}
      saveDisabled={saveDisabled}
      saveLabel="Guardar configuración"
      submitError={submitError}
      size="xl"
    >
      <Stack gap="lg">
        <SettingsFormField
          label="Zona horaria operativa"
          description="Usada por operaciones, reportes y el horario semanal."
        >
          <Select
            searchable
            data={timezoneOptions}
            value={getCanonicalOperationTimezone(formValues.operationTimezone)}
            onChange={(value) => {
              if (value) {
                applyUnifiedTimezone(value);
              }
            }}
            nothingFoundMessage="No se encontraron zonas horarias"
            disabled={disabled}
            aria-label="Zona horaria operativa"
          />
        </SettingsFormField>

        <OperationalSettingsForm
          values={formValues}
          onChange={setFormValues}
          disabled={disabled}
          validationErrors={validationErrors}
          showTimezone={false}
          showDefaultOperationTimes={false}
        />

        <CompanyWeeklyScheduleDialogContent
          timezone={scheduleDraft.timezone}
          days={scheduleDraft.days}
          onTimezoneChange={applyUnifiedTimezone}
          onDaysChange={(days) => setScheduleDraft((current) => ({ ...current, days }))}
          disabled={disabled}
          showTimezone={false}
        />
      </Stack>
    </SettingsDialog>
  );
}
