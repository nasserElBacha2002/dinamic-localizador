import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { FormErrorAlert, ResponsiveModal, SectionCard } from "../../design-system";
import {
  useAddOperationShiftVersion,
  useCreateOperationShift,
  useDeactivateOperationShift,
  useOperationShifts,
  useTransitionOperationToMultiShift,
  useTransitionOperationToSingle,
  useUpsertOperationShiftException,
} from "../../hooks/useOperationShifts";
import { useShiftTemplates } from "../../hooks/useShiftTemplates";
import type {
  OperationShiftWithVersions,
  ScheduleMode,
  ShiftDateExceptionKind,
} from "../../types/operation-shift";
import { getTodayDateInput } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import { isOvernightShift } from "../../utils/operation-shift-payload";
import { partitionShiftVersions } from "../../utils/operation-shift-version";
import { OperationTimeInput } from "../../pages/settings/components/OperationTimeInput";

const DAY_LABELS: Record<number, string> = {
  1: "Lun",
  2: "Mar",
  3: "Mié",
  4: "Jue",
  5: "Vie",
  6: "Sáb",
  7: "Dom",
};

const ISO_DAY_OPTIONS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 7, label: "Dom" },
] as const;

function formatVersionDays(days: { dayOfWeek: number; isEnabled: boolean }[] | undefined): string {
  if (!days?.length) {
    return "Todos los días";
  }
  const enabled = days
    .filter((day) => day.isEnabled)
    .map((day) => DAY_LABELS[day.dayOfWeek] ?? String(day.dayOfWeek));
  return enabled.length > 0 ? enabled.join(", ") : "Sin días";
}

function formatVersionTimes(startTime: string, endTime: string): string {
  return isOvernightShift(startTime, endTime)
    ? `${startTime} → ${endTime} (nocturno)`
    : `${startTime} – ${endTime}`;
}

export interface OperationShiftsPanelProps {
  operationId: string;
  scheduleMode?: ScheduleMode;
  canManage: boolean;
  onFeedback: (message: string, severity: "success" | "error") => void;
}

export function OperationShiftsPanel({
  operationId,
  scheduleMode = "SINGLE",
  canManage,
  onFeedback,
}: OperationShiftsPanelProps) {
  const refDate = getTodayDateInput();
  const isMulti = scheduleMode === "MULTI_SHIFT";
  const shiftsQuery = useOperationShifts(operationId, {}, isMulti || canManage);
  const templatesQuery = useShiftTemplates({ activeOnly: true }, canManage);
  const createShiftMutation = useCreateOperationShift(operationId);
  const deactivateShiftMutation = useDeactivateOperationShift(operationId);
  const addVersionMutation = useAddOperationShiftVersion(operationId);
  const upsertExceptionMutation = useUpsertOperationShiftException(operationId);
  const toMultiMutation = useTransitionOperationToMultiShift(operationId);
  const toSingleMutation = useTransitionOperationToSingle(operationId);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<"template" | "custom" | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [customStart, setCustomStart] = useState("08:00");
  const [customEnd, setCustomEnd] = useState("16:00");
  const [effectiveFrom, setEffectiveFrom] = useState(getTodayDateInput());

  const [toMultiOpen, setToMultiOpen] = useState(false);
  const [toSingleOpen, setToSingleOpen] = useState(false);
  const [transitionDate, setTransitionDate] = useState(getTodayDateInput());
  const [selectedTemplateIdsForTransition, setSelectedTemplateIdsForTransition] = useState<
    string[]
  >([]);

  const [versionShift, setVersionShift] = useState<OperationShiftWithVersions | null>(null);
  const [versionFrom, setVersionFrom] = useState(getTodayDateInput());
  const [versionStart, setVersionStart] = useState("08:00");
  const [versionEnd, setVersionEnd] = useState("16:00");
  const [versionDays, setVersionDays] = useState<number[]>([1, 2, 3, 4, 5]);

  const [exceptionShift, setExceptionShift] = useState<OperationShiftWithVersions | null>(null);
  const [exceptionKind, setExceptionKind] = useState<ShiftDateExceptionKind>("CANCEL");
  const [exceptionDate, setExceptionDate] = useState(getTodayDateInput());
  const [exceptionStart, setExceptionStart] = useState("08:00");
  const [exceptionEnd, setExceptionEnd] = useState("16:00");
  const [exceptionReason, setExceptionReason] = useState("");

  const shifts = useMemo(
    () =>
      [...(shiftsQuery.data ?? [])].sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "es"),
      ),
    [shiftsQuery.data],
  );
  const activeShifts = shifts.filter((shift) => shift.isActive);
  const activeTemplates = templatesQuery.data ?? [];

  const templateOptions = activeTemplates.map((template) => ({
    value: template.id,
    label: `${template.name} (${template.startTime}–${template.endTime})`,
  }));

  const busy =
    createShiftMutation.isPending ||
    deactivateShiftMutation.isPending ||
    addVersionMutation.isPending ||
    upsertExceptionMutation.isPending ||
    toMultiMutation.isPending ||
    toSingleMutation.isPending;

  const resetAddForm = () => {
    setAddMode(null);
    setSelectedTemplateId(null);
    setCustomName("");
    setCustomCode("");
    setCustomStart("08:00");
    setCustomEnd("16:00");
    setEffectiveFrom(getTodayDateInput());
  };

  const handleAddShift = async () => {
    if (!canManage || !isMulti) {
      return;
    }
    setErrorMessage(null);
    try {
      if (addMode === "template") {
        const template = activeTemplates.find((item) => item.id === selectedTemplateId);
        if (!template) {
          setErrorMessage("Seleccioná una plantilla.");
          return;
        }
        await createShiftMutation.mutateAsync({
          templateId: template.id,
          code: template.code,
          name: template.name,
          startTime: template.startTime,
          endTime: template.endTime,
          effectiveFrom,
        });
      } else if (addMode === "custom") {
        if (!customName.trim()) {
          setErrorMessage("El nombre del turno es obligatorio.");
          return;
        }
        await createShiftMutation.mutateAsync({
          ...(customCode.trim() ? { code: customCode.trim() } : {}),
          name: customName.trim(),
          startTime: customStart,
          endTime: customEnd,
          effectiveFrom,
        });
      } else {
        return;
      }
      resetAddForm();
      onFeedback("Turno agregado correctamente.", "success");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  const handleDeactivate = async (shiftId: string) => {
    setErrorMessage(null);
    try {
      await deactivateShiftMutation.mutateAsync(shiftId);
      onFeedback("Turno desactivado.", "success");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  const openVersionModal = (shift: OperationShiftWithVersions) => {
    const { current } = partitionShiftVersions(shift.versions, refDate);
    setVersionShift(shift);
    setVersionFrom(getTodayDateInput());
    setVersionStart(current?.startTime ?? "08:00");
    setVersionEnd(current?.endTime ?? "16:00");
    setVersionDays(
      current?.days?.filter((day) => day.isEnabled).map((day) => day.dayOfWeek) ?? [
        1, 2, 3, 4, 5,
      ],
    );
    setErrorMessage(null);
  };

  const handleAddVersion = async () => {
    if (!versionShift) {
      return;
    }
    if (versionFrom <= refDate) {
      setErrorMessage("La nueva versión debe tener vigencia futura (después de hoy).");
      return;
    }
    setErrorMessage(null);
    try {
      await addVersionMutation.mutateAsync({
        shiftId: versionShift.id,
        input: {
          effectiveFrom: versionFrom,
          startTime: versionStart,
          endTime: versionEnd,
          days: ISO_DAY_OPTIONS.map((day) => ({
            dayOfWeek: day.value,
            isEnabled: versionDays.includes(day.value),
          })),
        },
      });
      setVersionShift(null);
      onFeedback("Versión futura creada.", "success");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  const openExceptionModal = (shift: OperationShiftWithVersions) => {
    const { current } = partitionShiftVersions(shift.versions, refDate);
    setExceptionShift(shift);
    setExceptionKind("CANCEL");
    setExceptionDate(getTodayDateInput());
    setExceptionStart(current?.startTime ?? "08:00");
    setExceptionEnd(current?.endTime ?? "16:00");
    setExceptionReason("");
    setErrorMessage(null);
  };

  const handleUpsertException = async () => {
    if (!exceptionShift) {
      return;
    }
    if (exceptionKind === "TIME_OVERRIDE" && (!exceptionStart || !exceptionEnd)) {
      setErrorMessage("La excepción de horario requiere hora de inicio y fin.");
      return;
    }
    setErrorMessage(null);
    try {
      await upsertExceptionMutation.mutateAsync({
        shiftId: exceptionShift.id,
        input: {
          workDate: exceptionDate,
          exceptionKind,
          ...(exceptionKind === "TIME_OVERRIDE"
            ? { startTime: exceptionStart, endTime: exceptionEnd }
            : {}),
          ...(exceptionReason.trim() ? { reason: exceptionReason.trim() } : {}),
        },
      });
      setExceptionShift(null);
      onFeedback("Excepción guardada.", "success");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  const handleTransitionToMulti = async () => {
    setErrorMessage(null);
    const selected = activeTemplates.filter((template) =>
      selectedTemplateIdsForTransition.includes(template.id),
    );
    if (selected.length === 0) {
      setErrorMessage("Seleccioná al menos una plantilla para el cambio a multi-turno.");
      return;
    }
    try {
      await toMultiMutation.mutateAsync({
        effectiveFrom: transitionDate,
        shifts: selected.map((template, index) => ({
          code: template.code,
          name: template.name,
          templateId: template.id,
          sortOrder: index,
          startTime: template.startTime,
          endTime: template.endTime,
        })),
      });
      setToMultiOpen(false);
      setSelectedTemplateIdsForTransition([]);
      onFeedback("La operación pasó a modo multi-turno.", "success");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  const handleTransitionToSingle = async () => {
    setErrorMessage(null);
    try {
      await toSingleMutation.mutateAsync({ effectiveFrom: transitionDate });
      setToSingleOpen(false);
      onFeedback("La operación volvió a modo horario único.", "success");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  return (
    <>
      <SectionCard
        title="Turnos de la operación"
        description={
          isMulti
            ? "Modo multi-turno: cada jornada se materializa por turno. Fecha operativa de referencia: hoy."
            : "Modo horario único. Podés pasar a multi-turno cuando la operación necesite varios turnos."
        }
      >
        <Stack gap="md">
          <Group gap="xs">
            <Badge color={isMulti ? "blue" : "gray"} variant="light">
              {isMulti ? "Multi-turno" : "Horario único"}
            </Badge>
            {isMulti ? (
              <Text size="xs" c="dimmed">
                Referencia: {refDate}
              </Text>
            ) : null}
          </Group>

          <FormErrorAlert message={errorMessage} />

          {canManage && !isMulti ? (
            <Alert color="blue" title="Cambiar a multi-turno">
              <Stack gap="sm">
                <Text size="sm">
                  Vas a definir turnos a partir de plantillas de la empresa. Las asignaciones
                  actuales se redistribuyen según la configuración del servidor.
                </Text>
                <Button
                  size="xs"
                  variant="light"
                  disabled={busy}
                  onClick={() => {
                    setTransitionDate(getTodayDateInput());
                    setSelectedTemplateIdsForTransition(
                      activeTemplates.slice(0, 2).map((template) => template.id),
                    );
                    setErrorMessage(null);
                    setToMultiOpen(true);
                  }}
                >
                  Pasar a multi-turno
                </Button>
              </Stack>
            </Alert>
          ) : null}

          {isMulti ? (
            <>
              {shiftsQuery.isPending ? (
                <Text size="sm" c="dimmed">
                  Cargando turnos…
                </Text>
              ) : shiftsQuery.isError ? (
                <Alert color="red" title="No se pudieron cargar los turnos">
                  <Stack gap="sm">
                    <Text size="sm">{getApiErrorMessage(shiftsQuery.error)}</Text>
                    <Button size="xs" variant="light" onClick={() => void shiftsQuery.refetch()}>
                      Reintentar
                    </Button>
                  </Stack>
                </Alert>
              ) : activeShifts.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No hay turnos activos. Agregá uno desde plantilla o personalizado.
                </Text>
              ) : (
                <Stack gap="md">
                  {activeShifts.map((shift) => {
                    const partitioned = partitionShiftVersions(shift.versions, refDate);
                    const current = partitioned.current;
                    return (
                      <Stack key={shift.id} gap={6}>
                        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
                          <Stack gap={2} style={{ minWidth: 0 }}>
                            <Group gap="xs">
                              <Text fw={600} size="sm">
                                {shift.name}
                              </Text>
                              <Badge size="xs" variant="outline">
                                {shift.code}
                              </Badge>
                              {current && isOvernightShift(current.startTime, current.endTime) ? (
                                <Badge size="xs" color="violet" variant="light">
                                  Nocturno
                                </Badge>
                              ) : null}
                            </Group>
                            {current ? (
                              <Text size="sm" c="dimmed">
                                Vigente: {formatVersionTimes(current.startTime, current.endTime)} ·{" "}
                                {formatVersionDays(current.days)} · desde {current.effectiveFrom}
                                {current.effectiveUntil ? ` hasta ${current.effectiveUntil}` : ""}
                              </Text>
                            ) : (
                              <Text size="sm" c="orange">
                                Sin versión vigente para hoy.
                              </Text>
                            )}
                            {partitioned.upcoming.length > 0 ? (
                              <Text size="xs" c="dimmed">
                                Próximas:{" "}
                                {partitioned.upcoming
                                  .map(
                                    (version) =>
                                      `${version.effectiveFrom} (${formatVersionTimes(version.startTime, version.endTime)})`,
                                  )
                                  .join("; ")}
                              </Text>
                            ) : null}
                            {partitioned.past.length > 0 ? (
                              <Text size="xs" c="dimmed">
                                Anteriores:{" "}
                                {partitioned.past
                                  .slice(0, 2)
                                  .map(
                                    (version) =>
                                      `${version.effectiveFrom}${version.effectiveUntil ? `–${version.effectiveUntil}` : ""}`,
                                  )
                                  .join("; ")}
                                {partitioned.past.length > 2
                                  ? ` (+${partitioned.past.length - 2})`
                                  : ""}
                              </Text>
                            ) : null}
                          </Stack>
                          {canManage ? (
                            <Group gap={6}>
                              <Button
                                size="compact-xs"
                                variant="light"
                                disabled={busy}
                                onClick={() => openVersionModal(shift)}
                              >
                                Nueva versión
                              </Button>
                              <Button
                                size="compact-xs"
                                variant="default"
                                disabled={busy}
                                onClick={() => openExceptionModal(shift)}
                              >
                                Excepción
                              </Button>
                              <Button
                                size="compact-xs"
                                color="red"
                                variant="light"
                                disabled={busy}
                                onClick={() => void handleDeactivate(shift.id)}
                              >
                                Desactivar
                              </Button>
                            </Group>
                          ) : null}
                        </Group>
                      </Stack>
                    );
                  })}
                </Stack>
              )}

              {canManage ? (
                <Stack gap="sm">
                  {!addMode ? (
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="light"
                        disabled={busy || templateOptions.length === 0}
                        onClick={() => setAddMode("template")}
                      >
                        Agregar desde plantilla
                      </Button>
                      <Button
                        size="xs"
                        variant="default"
                        disabled={busy}
                        onClick={() => setAddMode("custom")}
                      >
                        Turno personalizado
                      </Button>
                      <Button
                        size="xs"
                        color="orange"
                        variant="light"
                        disabled={busy}
                        onClick={() => {
                          setTransitionDate(getTodayDateInput());
                          setErrorMessage(null);
                          setToSingleOpen(true);
                        }}
                      >
                        Volver a horario único
                      </Button>
                    </Group>
                  ) : (
                    <Stack gap="sm">
                      <TextInput
                        label="Vigente desde"
                        type="date"
                        value={effectiveFrom}
                        onChange={(event) => setEffectiveFrom(event.currentTarget.value)}
                        required
                      />
                      {addMode === "template" ? (
                        <Select
                          label="Plantilla"
                          data={templateOptions}
                          value={selectedTemplateId}
                          onChange={(value) => setSelectedTemplateId(value)}
                          placeholder="Elegí una plantilla"
                          searchable
                        />
                      ) : (
                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                          <TextInput
                            label="Código"
                            value={customCode}
                            onChange={(event) => setCustomCode(event.currentTarget.value)}
                            placeholder="Opcional"
                          />
                          <TextInput
                            label="Nombre"
                            value={customName}
                            onChange={(event) => setCustomName(event.currentTarget.value)}
                            required
                          />
                          <Stack gap={4}>
                            <Text size="sm" fw={500}>
                              Inicio
                            </Text>
                            <OperationTimeInput
                              value={customStart}
                              onChange={setCustomStart}
                              aria-label="Inicio del turno"
                            />
                          </Stack>
                          <Stack gap={4}>
                            <Text size="sm" fw={500}>
                              Fin
                            </Text>
                            <OperationTimeInput
                              value={customEnd}
                              onChange={setCustomEnd}
                              aria-label="Fin del turno"
                            />
                          </Stack>
                        </SimpleGrid>
                      )}
                      <Group gap="xs">
                        <Button
                          size="xs"
                          loading={createShiftMutation.isPending}
                          onClick={() => void handleAddShift()}
                        >
                          Guardar turno
                        </Button>
                        <Button size="xs" variant="default" disabled={busy} onClick={resetAddForm}>
                          Cancelar
                        </Button>
                      </Group>
                    </Stack>
                  )}
                </Stack>
              ) : null}
            </>
          ) : null}
        </Stack>
      </SectionCard>

      <ResponsiveModal
        opened={Boolean(versionShift)}
        onClose={addVersionMutation.isPending ? () => undefined : () => setVersionShift(null)}
        title="Nueva versión de turno"
        size="md"
        closeOnClickOutside={!addVersionMutation.isPending}
        closeOnEscape={!addVersionMutation.isPending}
        footer={
          <Group justify="flex-end" gap="sm">
            <Button
              variant="default"
              disabled={addVersionMutation.isPending}
              onClick={() => setVersionShift(null)}
            >
              Cancelar
            </Button>
            <Button loading={addVersionMutation.isPending} onClick={() => void handleAddVersion()}>
              Crear versión
            </Button>
          </Group>
        }
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            La versión futura cierra la vigencia actual al día anterior. Solo se confirma si el
            servidor responde correctamente.
          </Text>
          <TextInput
            label="Vigente desde"
            type="date"
            value={versionFrom}
            onChange={(event) => setVersionFrom(event.currentTarget.value)}
            required
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                Inicio
              </Text>
              <OperationTimeInput
                value={versionStart}
                onChange={setVersionStart}
                aria-label="Inicio versión"
              />
            </Stack>
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                Fin
              </Text>
              <OperationTimeInput
                value={versionEnd}
                onChange={setVersionEnd}
                aria-label="Fin versión"
              />
            </Stack>
          </SimpleGrid>
          {isOvernightShift(versionStart, versionEnd) ? (
            <Badge color="violet" variant="light" w="fit-content">
              Turno nocturno
            </Badge>
          ) : null}
          <Stack gap={6}>
            <Text size="sm" fw={500}>
              Días
            </Text>
            <Group gap="xs">
              {ISO_DAY_OPTIONS.map((day) => (
                <Checkbox
                  key={day.value}
                  label={day.label}
                  checked={versionDays.includes(day.value)}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setVersionDays((current) =>
                      checked
                        ? [...current, day.value].sort((a, b) => a - b)
                        : current.filter((value) => value !== day.value),
                    );
                  }}
                />
              ))}
            </Group>
          </Stack>
        </Stack>
      </ResponsiveModal>

      <ResponsiveModal
        opened={Boolean(exceptionShift)}
        onClose={
          upsertExceptionMutation.isPending ? () => undefined : () => setExceptionShift(null)
        }
        title="Excepción de fecha"
        size="md"
        closeOnClickOutside={!upsertExceptionMutation.isPending}
        closeOnEscape={!upsertExceptionMutation.isPending}
        footer={
          <Group justify="flex-end" gap="sm">
            <Button
              variant="default"
              disabled={upsertExceptionMutation.isPending}
              onClick={() => setExceptionShift(null)}
            >
              Cancelar
            </Button>
            <Button
              loading={upsertExceptionMutation.isPending}
              onClick={() => void handleUpsertException()}
            >
              Guardar excepción
            </Button>
          </Group>
        }
      >
        <Stack gap="sm">
          <Select
            label="Tipo"
            data={[
              { value: "CANCEL", label: "Cancelar jornada" },
              { value: "TIME_OVERRIDE", label: "Cambiar horario" },
              { value: "RESTORE", label: "Restaurar horario del turno" },
            ]}
            value={exceptionKind}
            onChange={(value) =>
              setExceptionKind((value as ShiftDateExceptionKind | null) ?? "CANCEL")
            }
          />
          <TextInput
            label="Fecha"
            type="date"
            value={exceptionDate}
            onChange={(event) => setExceptionDate(event.currentTarget.value)}
            required
          />
          {exceptionKind === "TIME_OVERRIDE" ? (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  Inicio
                </Text>
                <OperationTimeInput
                  value={exceptionStart}
                  onChange={setExceptionStart}
                  aria-label="Inicio excepción"
                />
              </Stack>
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  Fin
                </Text>
                <OperationTimeInput
                  value={exceptionEnd}
                  onChange={setExceptionEnd}
                  aria-label="Fin excepción"
                />
              </Stack>
            </SimpleGrid>
          ) : null}
          <Textarea
            label="Motivo"
            value={exceptionReason}
            onChange={(event) => setExceptionReason(event.currentTarget.value)}
            minRows={2}
          />
        </Stack>
      </ResponsiveModal>

      <ResponsiveModal
        opened={toMultiOpen}
        onClose={toMultiMutation.isPending ? () => undefined : () => setToMultiOpen(false)}
        title="Pasar a multi-turno"
        size="md"
        closeOnClickOutside={!toMultiMutation.isPending}
        closeOnEscape={!toMultiMutation.isPending}
        footer={
          <Group justify="flex-end" gap="sm">
            <Button
              variant="default"
              disabled={toMultiMutation.isPending}
              onClick={() => setToMultiOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              loading={toMultiMutation.isPending}
              onClick={() => void handleTransitionToMulti()}
            >
              Confirmar multi-turno
            </Button>
          </Group>
        }
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Confirmá la fecha de vigencia y las plantillas iniciales. El cambio se confirma
            cuando el servidor responde (sin éxito optimista).
          </Text>
          <TextInput
            label="Vigente desde"
            type="date"
            value={transitionDate}
            onChange={(event) => setTransitionDate(event.currentTarget.value)}
            required
          />
          {activeTemplates.length === 0 ? (
            <Alert color="yellow">
              No hay plantillas activas. Creá plantillas en Configuración → Plantillas de turnos.
            </Alert>
          ) : (
            <Stack gap={6}>
              <Text size="sm" fw={500}>
                Plantillas iniciales
              </Text>
              {activeTemplates.map((template) => (
                <Checkbox
                  key={template.id}
                  label={`${template.name} (${template.startTime}–${template.endTime})`}
                  checked={selectedTemplateIdsForTransition.includes(template.id)}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setSelectedTemplateIdsForTransition((current) =>
                      checked
                        ? [...current, template.id]
                        : current.filter((id) => id !== template.id),
                    );
                  }}
                />
              ))}
            </Stack>
          )}
        </Stack>
      </ResponsiveModal>

      <ResponsiveModal
        opened={toSingleOpen}
        onClose={toSingleMutation.isPending ? () => undefined : () => setToSingleOpen(false)}
        title="Volver a horario único"
        size="md"
        closeOnClickOutside={!toSingleMutation.isPending}
        closeOnEscape={!toSingleMutation.isPending}
        footer={
          <Group justify="flex-end" gap="sm">
            <Button
              variant="default"
              disabled={toSingleMutation.isPending}
              onClick={() => setToSingleOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              color="red"
              loading={toSingleMutation.isPending}
              onClick={() => void handleTransitionToSingle()}
            >
              Confirmar horario único
            </Button>
          </Group>
        }
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Se desactivará el modo multi-turno desde la fecha indicada. Confirmá solo si ya no
            necesitás varios turnos en esta operación.
          </Text>
          <TextInput
            label="Vigente desde"
            type="date"
            value={transitionDate}
            onChange={(event) => setTransitionDate(event.currentTarget.value)}
            required
          />
        </Stack>
      </ResponsiveModal>
    </>
  );
}
