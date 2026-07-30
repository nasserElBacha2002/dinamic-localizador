import {
  Alert,
  Button,
  Checkbox,
  Group,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { useMemo, useState } from "react";
import {
  useAbsenceCalendarDates,
  useAbsenceCalendars,
  useCreateAbsenceCalendar,
  useCreateAbsenceCalendarDate,
  useDefaultAbsenceCalendar,
  useUpdateAbsenceCalendar,
  useUpdateAbsenceCalendarDate,
  useBootstrapDefaultAbsenceCalendar,
} from "../../../hooks/useAbsenceCalendar";
import { useCompanySettings, useUpdateCompanySettings } from "../../../hooks/useCompanySettings";
import { getApiErrorMessage } from "../../../utils/errors";
import { SettingsDialog } from "./SettingsDialog";

const DATE_TYPE_OPTIONS = [
  { value: "HOLIDAY", label: "Feriado" },
  { value: "NON_WORKING_DAY", label: "No laborable" },
  { value: "WORKING_DAY_OVERRIDE", label: "Día laborable excepcional" },
  { value: "COMPANY_EVENT", label: "Evento de empresa" },
];

const WEEKDAY_LABELS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

interface CompanyAbsenceCalendarDialogProps {
  opened: boolean;
  onClose: () => void;
  canUpdate: boolean;
  onSaved: (message: string) => void;
}

export function CompanyAbsenceCalendarDialog({
  opened,
  onClose,
  canUpdate,
  onSaved,
}: CompanyAbsenceCalendarDialogProps) {
  const year = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(year);
  const calendarQuery = useDefaultAbsenceCalendar(opened);
  const calendarsQuery = useAbsenceCalendars(opened);
  const datesQuery = useAbsenceCalendarDates(calendarQuery.data?.id, selectedYear, opened);
  const updateCalendar = useUpdateAbsenceCalendar();
  const createCalendar = useCreateAbsenceCalendar();
  const createDate = useCreateAbsenceCalendarDate();
  const updateDate = useUpdateAbsenceCalendarDate();
  const bootstrap = useBootstrapDefaultAbsenceCalendar();
  const settingsQuery = useCompanySettings(opened);
  const updateSettings = useUpdateCompanySettings();

  const [name, setName] = useState("");
  const [newCalendarName, setNewCalendarName] = useState("");
  const [date, setDate] = useState("");
  const [dateType, setDateType] = useState<string>("HOLIDAY");
  const [isWorkingDay, setIsWorkingDay] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const calendar = calendarQuery.data;
  const weekdays = useMemo(() => calendar?.weekdays ?? [], [calendar]);

  const handleToggleWeekday = async (dayOfWeek: number, isWorking: boolean) => {
    if (!calendar || !canUpdate) {
      return;
    }
    setSubmitError(null);
    try {
      await updateCalendar.mutateAsync({
        calendarId: calendar.id,
        expectedVersion: calendar.version,
        weekdays: weekdays.map((day) =>
          day.dayOfWeek === dayOfWeek ? { dayOfWeek, isWorkingDay: isWorking } : {
            dayOfWeek: day.dayOfWeek,
            isWorkingDay: day.isWorkingDay,
          },
        ),
      });
      onSaved("Días laborables actualizados.");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const handleCreateDate = async () => {
    if (!calendar || !canUpdate || !name.trim() || !date) {
      return;
    }
    setSubmitError(null);
    try {
      await createDate.mutateAsync({
        calendarId: calendar.id,
        date,
        name: name.trim(),
        dateType,
        isWorkingDay,
        notes: notes.trim() || null,
      });
      setName("");
      setDate("");
      setNotes("");
      setIsWorkingDay(false);
      setDateType("HOLIDAY");
      onSaved("Fecha especial registrada.");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const handleDeactivate = async (dateId: string, expectedVersion: number) => {
    if (!calendar || !canUpdate) {
      return;
    }
    if (!window.confirm("¿Desactivar esta fecha especial?")) {
      return;
    }
    setSubmitError(null);
    try {
      await updateDate.mutateAsync({
        dateId,
        calendarId: calendar.id,
        isActive: false,
        expectedVersion,
      });
      onSaved("Fecha especial desactivada.");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  return (
    <SettingsDialog
      opened={opened}
      onClose={onClose}
      title="Calendario de ausencias"
      subtitle="Configurá días laborables, feriados y excepciones usados para calcular ausencias."
      size="xl"
      onSave={() => onClose()}
      saveLabel="Cerrar"
      saving={false}
      saveDisabled={false}
      submitError={submitError}
    >
      <Stack gap="md">
        {settingsQuery.data ? (
          <Switch
            label="Calendario avanzado de ausencias"
            description="Cuando está activo, los tipos en días hábiles usan feriados y weekdays. Las solicitudes históricas no se recalculan."
            checked={Boolean(settingsQuery.data.absenceAdvancedCalendarEnabled)}
            disabled={!canUpdate || updateSettings.isPending}
            onChange={(event) => {
              void updateSettings
                .mutateAsync({
                  absenceAdvancedCalendarEnabled: event.currentTarget.checked,
                })
                .then(() =>
                  onSaved(
                    event.currentTarget.checked
                      ? "Calendario avanzado activado."
                      : "Calendario avanzado desactivado (modo legacy).",
                  ),
                )
                .catch((error: unknown) => setSubmitError(getApiErrorMessage(error)));
            }}
          />
        ) : null}
        {settingsQuery.data ? (
          <Switch
            label="Integración operativa de ausencias"
            description="Cuando está activo, las ausencias aprobadas generan conflictos operativos y efectos auditables sin desasignar automáticamente. Desactivado por defecto; activar solo en empresas piloto."
            checked={Boolean(settingsQuery.data.absenceOperationalIntegrationEnabled)}
            disabled={!canUpdate || updateSettings.isPending}
            onChange={(event) => {
              void updateSettings
                .mutateAsync({
                  absenceOperationalIntegrationEnabled: event.currentTarget.checked,
                })
                .then(() =>
                  onSaved(
                    event.currentTarget.checked
                      ? "Integración operativa de ausencias activada."
                      : "Integración operativa de ausencias desactivada.",
                  ),
                )
                .catch((error: unknown) => setSubmitError(getApiErrorMessage(error)));
            }}
          />
        ) : null}
        {calendarQuery.isError ? (
          <Stack gap="sm">
            <Alert color="red">{getApiErrorMessage(calendarQuery.error)}</Alert>
            {canUpdate ? (
              <Button
                onClick={() =>
                  void bootstrap.mutateAsync().then(() => onSaved("Calendario por defecto creado."))
                }
                loading={bootstrap.isPending}
              >
                Crear calendario por defecto
              </Button>
            ) : null}
          </Stack>
        ) : null}
        {(calendarsQuery.data?.length ?? 0) > 0 ? (
          <Stack gap={4}>
            <Text fw={600}>Calendarios de la empresa</Text>
            {(calendarsQuery.data ?? []).map((item) => (
              <Text key={item.id} size="sm" c="dimmed">
                {item.name}
                {item.isDefault ? " · default" : ""}
                {!item.isActive ? " · inactivo" : ""} · {item.timezone}
              </Text>
            ))}
          </Stack>
        ) : null}

        {canUpdate && calendar ? (
          <Group align="flex-end" grow preventGrowOverflow={false}>
            <TextInput
              label="Nuevo calendario"
              placeholder="Nombre"
              value={newCalendarName}
              onChange={(event) => setNewCalendarName(event.currentTarget.value)}
            />
            <Button
              loading={createCalendar.isPending}
              onClick={() => {
                if (!newCalendarName.trim()) {
                  return;
                }
                void createCalendar
                  .mutateAsync({
                    name: newCalendarName.trim(),
                    timezone: calendar.timezone,
                    isDefault: false,
                  })
                  .then(() => {
                    setNewCalendarName("");
                    onSaved("Calendario creado.");
                  })
                  .catch((error: unknown) => setSubmitError(getApiErrorMessage(error)));
              }}
            >
              Crear
            </Button>
          </Group>
        ) : null}

        {calendar ? (
          <>
            <Text size="sm" c="dimmed">
              {calendar.name} · zona horaria {calendar.timezone}
              {calendar.isDefault ? " · calendario por defecto" : ""}
            </Text>
            <Stack gap="xs">
              <Text fw={600}>Días laborables semanales</Text>
              {weekdays.map((day) => (
                <Switch
                  key={day.dayOfWeek}
                  label={WEEKDAY_LABELS[day.dayOfWeek - 1] ?? `Día ${day.dayOfWeek}`}
                  checked={day.isWorkingDay}
                  disabled={!canUpdate || updateCalendar.isPending}
                  onChange={(event) =>
                    void handleToggleWeekday(day.dayOfWeek, event.currentTarget.checked)
                  }
                />
              ))}
            </Stack>

            <Group justify="space-between">
              <Text fw={600}>Fechas especiales</Text>
              <Select
                label="Año"
                data={[year - 1, year, year + 1].map((value) => ({
                  value: String(value),
                  label: String(value),
                }))}
                value={String(selectedYear)}
                onChange={(value) => setSelectedYear(Number(value ?? year))}
                w={120}
              />
            </Group>

            {canUpdate ? (
              <Stack gap="sm">
                <Group grow preventGrowOverflow={false} align="flex-start">
                  <TextInput
                    label="Fecha"
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.currentTarget.value)}
                  />
                  <TextInput
                    label="Nombre"
                    value={name}
                    onChange={(event) => setName(event.currentTarget.value)}
                  />
                </Group>
                <Group grow preventGrowOverflow={false} align="flex-start">
                  <Select
                    label="Tipo"
                    data={DATE_TYPE_OPTIONS}
                    value={dateType}
                    onChange={(value) => setDateType(value ?? "HOLIDAY")}
                  />
                  <Checkbox
                    mt="xl"
                    label="Es laborable"
                    checked={isWorkingDay}
                    onChange={(event) => setIsWorkingDay(event.currentTarget.checked)}
                  />
                </Group>
                <Textarea
                  label="Observación"
                  value={notes}
                  onChange={(event) => setNotes(event.currentTarget.value)}
                  minRows={2}
                />
                <Button
                  onClick={() => void handleCreateDate()}
                  loading={createDate.isPending}
                  disabled={!name.trim() || !date}
                >
                  Agregar fecha
                </Button>
              </Stack>
            ) : null}

            {datesQuery.isLoading ? <Text size="sm">Cargando fechas…</Text> : null}
            {datesQuery.isError ? (
              <Alert color="red">{getApiErrorMessage(datesQuery.error)}</Alert>
            ) : null}
            {(datesQuery.data?.length ?? 0) === 0 ? (
              <Text size="sm" c="dimmed">
                No hay fechas especiales para {selectedYear}.
              </Text>
            ) : (
              <Table.ScrollContainer minWidth={480}>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Fecha</Table.Th>
                      <Table.Th>Nombre</Table.Th>
                      <Table.Th>Tipo</Table.Th>
                      <Table.Th>Laborable</Table.Th>
                      <Table.Th />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {datesQuery.data?.map((item) => (
                      <Table.Tr key={item.id}>
                        <Table.Td>{item.date}</Table.Td>
                        <Table.Td>{item.name}</Table.Td>
                        <Table.Td>
                          {DATE_TYPE_OPTIONS.find((option) => option.value === item.dateType)
                            ?.label ?? item.dateType}
                        </Table.Td>
                        <Table.Td>{item.isWorkingDay ? "Sí" : "No"}</Table.Td>
                        <Table.Td>
                          {canUpdate ? (
                            <Button
                              size="xs"
                              variant="light"
                              color="red"
                              onClick={() => void handleDeactivate(item.id, item.version)}
                              loading={updateDate.isPending}
                            >
                              Desactivar
                            </Button>
                          ) : null}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </>
        ) : null}
      </Stack>
    </SettingsDialog>
  );
}
