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
  useCreateAbsenceCalendarDate,
  useDefaultAbsenceCalendar,
  useUpdateAbsenceCalendar,
  useUpdateAbsenceCalendarDate,
} from "../../../hooks/useAbsenceCalendar";
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
  const datesQuery = useAbsenceCalendarDates(calendarQuery.data?.id, selectedYear, opened);
  const updateCalendar = useUpdateAbsenceCalendar();
  const createDate = useCreateAbsenceCalendarDate();
  const updateDate = useUpdateAbsenceCalendarDate();

  const [name, setName] = useState("");
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
        expectedUpdatedAt: calendar.updatedAt,
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

  const handleDeactivate = async (dateId: string, expectedUpdatedAt: string) => {
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
        expectedUpdatedAt,
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
        {calendarQuery.isError ? (
          <Alert color="red">{getApiErrorMessage(calendarQuery.error)}</Alert>
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
                              onClick={() => void handleDeactivate(item.id, item.updatedAt)}
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
