import {
  Button,
  Group,
  Select,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";
import { EmployeeSearchAutocomplete } from "../../components/employees/EmployeeSearchAutocomplete";
import { AbsenceDurationPreviewPanel } from "../../components/absences/AbsenceDurationPreviewPanel";
import { ResponsiveModal } from "../../design-system";
import { useAbsenceDurationPreview } from "../../hooks/useAbsenceCalendar";
import { useCreateAbsenceRequest } from "../../hooks/useAbsences";
import type { AbsenceDayPeriod } from "../../types/absence";
import { getApiErrorMessage } from "../../utils/errors";

const PERIOD_OPTIONS: Array<{ value: AbsenceDayPeriod; label: string }> = [
  { value: "FULL_DAY", label: "Día completo" },
  { value: "AM", label: "Mañana (AM)" },
  { value: "PM", label: "Tarde (PM)" },
];

export function CreateAbsenceRequestDialog({
  opened,
  onClose,
  typeOptions,
  onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  typeOptions: Array<{
    value: string;
    label: string;
    allowsHalfDay?: boolean;
    dayCountingMode?: string;
  }>;
  onCreated: () => void;
}) {
  const createMutation = useCreateAbsenceRequest();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [absenceTypeId, setAbsenceTypeId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startPeriod, setStartPeriod] = useState<AbsenceDayPeriod>("FULL_DAY");
  const [endPeriod, setEndPeriod] = useState<AbsenceDayPeriod>("FULL_DAY");
  const [reason, setReason] = useState("");

  const selectedType = useMemo(
    () => typeOptions.find((option) => option.value === absenceTypeId),
    [absenceTypeId, typeOptions],
  );
  const allowsHalfDay = selectedType?.allowsHalfDay === true;

  const previewInput = useMemo(
    () =>
      employeeId && absenceTypeId && startDate && endDate
        ? {
            employeeId,
            absenceTypeId,
            startDate,
            endDate,
            startPeriod: allowsHalfDay ? startPeriod : ("FULL_DAY" as const),
            endPeriod: allowsHalfDay ? endPeriod : ("FULL_DAY" as const),
          }
        : null,
    [allowsHalfDay, absenceTypeId, employeeId, endDate, endPeriod, startDate, startPeriod],
  );

  const previewQuery = useAbsenceDurationPreview(previewInput, opened);

  const handleTypeChange = (value: string | null) => {
    setAbsenceTypeId(value);
    const next = typeOptions.find((option) => option.value === value);
    if (!next?.allowsHalfDay) {
      setStartPeriod("FULL_DAY");
      setEndPeriod("FULL_DAY");
    }
  };

  const handleSubmit = async () => {
    if (!employeeId || !absenceTypeId || !startDate || !endDate || reason.trim().length < 3) {
      notifications.show({
        color: "red",
        message: "Completá empleado, tipo, fechas y motivo (mínimo 3 caracteres).",
      });
      return;
    }
    if (startDate > endDate) {
      notifications.show({
        color: "red",
        message: "La fecha de inicio no puede ser posterior a la fecha de fin.",
      });
      return;
    }

    try {
      await createMutation.mutateAsync({
        employeeId,
        absenceTypeId,
        startDate,
        endDate,
        startPeriod: allowsHalfDay ? startPeriod : "FULL_DAY",
        endPeriod: allowsHalfDay ? endPeriod : "FULL_DAY",
        reason: reason.trim(),
      });
      notifications.show({ color: "green", message: "Solicitud creada." });
      onCreated();
      onClose();
    } catch (error) {
      notifications.show({ color: "red", message: getApiErrorMessage(error) });
    }
  };

  return (
    <ResponsiveModal
      opened={opened}
      onClose={onClose}
      title="Nueva solicitud de ausencia"
      size="lg"
      bodyMode="scroll"
    >
      <Stack gap="md">
        <EmployeeSearchAutocomplete
          label="Colaborador"
          value={employeeId}
          onChange={setEmployeeId}
          activeOnly
          disabled={createMutation.isPending}
        />
        <Select
          label="Tipo de ausencia"
          data={typeOptions.map(({ value, label, dayCountingMode }) => ({
            value,
            label:
              dayCountingMode === "BUSINESS_DAYS" ? `${label} (días hábiles)` : label,
          }))}
          value={absenceTypeId}
          onChange={handleTypeChange}
          searchable
          disabled={createMutation.isPending}
        />
        <Group grow preventGrowOverflow={false} align="flex-start">
          <TextInput
            label="Fecha de inicio"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.currentTarget.value)}
            disabled={createMutation.isPending}
          />
          <TextInput
            label="Fecha de fin"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.currentTarget.value)}
            disabled={createMutation.isPending}
          />
        </Group>
        {allowsHalfDay ? (
          <Group grow preventGrowOverflow={false} align="flex-start">
            <Select
              label="Período de inicio"
              data={PERIOD_OPTIONS}
              value={startPeriod}
              onChange={(value) => setStartPeriod((value as AbsenceDayPeriod) ?? "FULL_DAY")}
              disabled={createMutation.isPending}
            />
            <Select
              label="Período de fin"
              data={PERIOD_OPTIONS}
              value={endPeriod}
              onChange={(value) => setEndPeriod((value as AbsenceDayPeriod) ?? "FULL_DAY")}
              disabled={createMutation.isPending}
            />
          </Group>
        ) : null}
        <AbsenceDurationPreviewPanel query={previewQuery} />
        <Textarea
          label="Motivo"
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
          minRows={3}
          disabled={createMutation.isPending}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={createMutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} loading={createMutation.isPending}>
            Crear solicitud
          </Button>
        </Group>
      </Stack>
    </ResponsiveModal>
  );
}
