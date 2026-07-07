import { useMemo, useState } from "react";
import {
  getCanonicalOperationTimezone,
} from "../../../constants/operation-timezones";
import { useUpdateCompanyWorkSchedule } from "../../../hooks/useCompanyWorkSchedule";
import type { CompanyWorkSchedule, WeeklyScheduleDay } from "../../../types/schedule";
import { getApiErrorMessage } from "../../../utils/errors";
import { CompanyWeeklyScheduleDialogContent } from "./CompanyWeeklyScheduleDialogContent";
import { SettingsDialog } from "./SettingsDialog";

interface CompanyWeeklyScheduleDialogProps {
  opened: boolean;
  onClose: () => void;
  schedule: CompanyWorkSchedule;
  canUpdate: boolean;
  onSaved: (message: string) => void;
}

function schedulesEqual(left: WeeklyScheduleDay[], right: WeeklyScheduleDay[]): boolean {
  return left.every((day, index) => {
    const other = right[index];
    return (
      day.dayOfWeek === other.dayOfWeek &&
      day.isEnabled === other.isEnabled &&
      day.startTime === other.startTime &&
      day.endTime === other.endTime
    );
  });
}

export function CompanyWeeklyScheduleDialog({
  opened,
  onClose,
  schedule,
  canUpdate,
  onSaved,
}: CompanyWeeklyScheduleDialogProps) {
  const updateMutation = useUpdateCompanyWorkSchedule();

  const baseline = useMemo(
    () => ({
      timezone: schedule.timezone,
      days: schedule.days,
    }),
    [schedule],
  );

  const [timezone, setTimezone] = useState<string | null>(null);
  const [days, setDays] = useState<WeeklyScheduleDay[] | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const currentTimezone = timezone ?? baseline.timezone;
  const currentDays = days ?? baseline.days;
  const hasChanges =
    currentTimezone !== baseline.timezone || !schedulesEqual(currentDays, baseline.days);
  const disabled = !canUpdate || updateMutation.isPending;

  const handleClose = () => {
    if (updateMutation.isPending) {
      return;
    }
    setTimezone(null);
    setDays(null);
    setSubmitError(null);
    onClose();
  };

  const handleSave = async () => {
    if (!canUpdate || !hasChanges || updateMutation.isPending) {
      return;
    }

    setSubmitError(null);
    try {
      await updateMutation.mutateAsync({
        timezone: getCanonicalOperationTimezone(currentTimezone),
        days: currentDays,
      });
      onSaved("Horario laboral semanal guardado correctamente.");
      handleClose();
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  return (
    <SettingsDialog
      opened={opened}
      onClose={handleClose}
      title="Horario laboral semanal"
      subtitle="Este horario se utilizará como configuración predeterminada para las operaciones habituales que usen el horario de la empresa."
      onSave={handleSave}
      saving={updateMutation.isPending}
      saveDisabled={!hasChanges || disabled}
      saveLabel="Guardar horario semanal"
      submitError={submitError}
      size="lg"
    >
      <CompanyWeeklyScheduleDialogContent
        timezone={currentTimezone}
        days={currentDays}
        onTimezoneChange={setTimezone}
        onDaysChange={setDays}
        disabled={disabled}
      />
    </SettingsDialog>
  );
}
