import { Button, Group, Select, Stack, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import { WeeklyScheduleEditor } from "../../../components/schedules/WeeklyScheduleEditor";
import { getCanonicalOperationTimezone, getOperationTimezoneOptions } from "../../../constants/operation-timezones";
import { FormErrorAlert, SectionCard } from "../../../design-system";
import { useCompanyWorkSchedule, useUpdateCompanyWorkSchedule } from "../../../hooks/useCompanyWorkSchedule";
import type { WeeklyScheduleDay } from "../../../types/schedule";
import { getApiErrorMessage } from "../../../utils/errors";

interface CompanyWeeklyScheduleSectionProps {
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

export function CompanyWeeklyScheduleSection({
  canUpdate,
  onSaved,
}: CompanyWeeklyScheduleSectionProps) {
  const scheduleQuery = useCompanyWorkSchedule();
  const updateMutation = useUpdateCompanyWorkSchedule();

  const baseline = useMemo(
    () =>
      scheduleQuery.data
        ? {
            timezone: scheduleQuery.data.timezone,
            days: scheduleQuery.data.days,
          }
        : null,
    [scheduleQuery.data],
  );

  const [timezone, setTimezone] = useState<string | null>(null);
  const [days, setDays] = useState<WeeklyScheduleDay[] | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const currentTimezone = timezone ?? baseline?.timezone ?? "America/Argentina/Buenos_Aires";
  const currentDays = days ?? baseline?.days ?? [];
  const hasChanges =
    baseline !== null &&
    (currentTimezone !== baseline.timezone || !schedulesEqual(currentDays, baseline.days));
  const timezoneOptions = useMemo(
    () => getOperationTimezoneOptions(currentTimezone),
    [currentTimezone],
  );

  const handleReset = () => {
    if (!baseline) {
      return;
    }
    setTimezone(baseline.timezone);
    setDays(baseline.days);
    setSubmitError(null);
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
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  if (scheduleQuery.isPending) {
    return (
      <SectionCard title="Horario laboral semanal" description="Cargando horario...">
        <Text size="sm" c="dimmed">
          Cargando...
        </Text>
      </SectionCard>
    );
  }

  if (scheduleQuery.isError || !baseline) {
    return (
      <SectionCard title="Horario laboral semanal">
        <Text size="sm" c="red">
          {getApiErrorMessage(scheduleQuery.error, "No se pudo cargar el horario laboral semanal.")}
        </Text>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Horario laboral semanal"
      description="Este horario se utilizará como configuración predeterminada para las operaciones habituales que usen el horario de la empresa."
    >
      <Stack gap="md">
        <Select
          searchable
          label="Zona horaria"
          data={timezoneOptions}
          value={getCanonicalOperationTimezone(currentTimezone)}
          onChange={(value) => {
            if (value) {
              setTimezone(value);
            }
          }}
          disabled={!canUpdate || updateMutation.isPending}
        />

        <WeeklyScheduleEditor
          value={currentDays}
          onChange={(next) => setDays(next)}
          disabled={!canUpdate || updateMutation.isPending}
        />

        <FormErrorAlert message={submitError} />

        {canUpdate ? (
          <Group gap="sm">
            <Button
              onClick={() => void handleSave()}
              disabled={!hasChanges || updateMutation.isPending}
              loading={updateMutation.isPending}
            >
              Guardar horario semanal
            </Button>
            <Button
              variant="default"
              onClick={handleReset}
              disabled={!hasChanges || updateMutation.isPending}
            >
              Descartar cambios
            </Button>
          </Group>
        ) : null}
      </Stack>
    </SectionCard>
  );
}
