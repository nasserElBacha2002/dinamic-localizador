import { Alert, Button, Group, Select, Stack, Textarea, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";
import { AbsenceDurationPreviewPanel } from "../../components/absences/AbsenceDurationPreviewPanel";
import { SectionCard } from "../../design-system";
import { useAbsenceDurationPreview } from "../../hooks/useAbsenceCalendar";
import {
  useResubmitAbsenceRequest,
  useUpdateNeedsInfoAbsenceRequest,
} from "../../hooks/useAbsences";
import type { AbsenceDayPeriod, AbsenceRequestDetail } from "../../types/absence";

const PERIOD_OPTIONS: Array<{ value: AbsenceDayPeriod; label: string }> = [
  { value: "FULL_DAY", label: "Día completo" },
  { value: "AM", label: "Mañana (AM)" },
  { value: "PM", label: "Tarde (PM)" },
];

export function AbsenceNeedsInfoEditor({
  detail,
  typeOptions,
  onSaved,
  onConflict,
}: {
  detail: AbsenceRequestDetail;
  typeOptions: Array<{
    value: string;
    label: string;
    allowsHalfDay?: boolean;
    dayCountingMode?: string;
  }>;
  onSaved: () => void;
  onConflict: (error: unknown) => void;
}) {
  const updateMutation = useUpdateNeedsInfoAbsenceRequest(detail.id);
  const resubmitMutation = useResubmitAbsenceRequest(detail.id);
  const [editReason, setEditReason] = useState(detail.reason);
  const [editStartDate, setEditStartDate] = useState(detail.startDate);
  const [editEndDate, setEditEndDate] = useState(detail.endDate);
  const [editAbsenceTypeId, setEditAbsenceTypeId] = useState(detail.absenceTypeId);
  const [editStartPeriod, setEditStartPeriod] = useState<AbsenceDayPeriod>(detail.startPeriod);
  const [editEndPeriod, setEditEndPeriod] = useState<AbsenceDayPeriod>(detail.endPeriod);

  const selectedType = useMemo(
    () => typeOptions.find((option) => option.value === editAbsenceTypeId),
    [editAbsenceTypeId, typeOptions],
  );
  const allowsHalfDay = selectedType?.allowsHalfDay === true;

  const previewInput = useMemo(
    () => ({
      employeeId: detail.employeeId,
      absenceTypeId: editAbsenceTypeId,
      startDate: editStartDate,
      endDate: editEndDate,
      startPeriod: allowsHalfDay ? editStartPeriod : ("FULL_DAY" as const),
      endPeriod: allowsHalfDay ? editEndPeriod : ("FULL_DAY" as const),
    }),
    [
      allowsHalfDay,
      detail.employeeId,
      editAbsenceTypeId,
      editEndDate,
      editEndPeriod,
      editStartDate,
      editStartPeriod,
    ],
  );

  const previewQuery = useAbsenceDurationPreview(previewInput, Boolean(editAbsenceTypeId));

  const notify = (message: string, color: "green" | "red" = "green") => {
    notifications.show({ color, message });
  };

  const handleTypeChange = (value: string | null) => {
    const nextId = value ?? "";
    setEditAbsenceTypeId(nextId);
    const nextType = typeOptions.find((option) => option.value === nextId);
    if (!nextType?.allowsHalfDay) {
      setEditStartPeriod("FULL_DAY");
      setEditEndPeriod("FULL_DAY");
    }
  };

  const handleSaveNeedsInfoEdit = async () => {
    if (!editReason.trim() || editReason.trim().length < 3) {
      notify("El motivo es obligatorio (mínimo 3 caracteres).", "red");
      return;
    }
    if (!editStartDate || !editEndDate) {
      notify("Las fechas son obligatorias.", "red");
      return;
    }
    if (editStartDate > editEndDate) {
      notify("La fecha de inicio no puede ser posterior a la fecha de fin.", "red");
      return;
    }

    try {
      await updateMutation.mutateAsync({
        reason: editReason.trim(),
        startDate: editStartDate,
        endDate: editEndDate,
        absenceTypeId: editAbsenceTypeId || undefined,
        startPeriod: allowsHalfDay ? editStartPeriod : "FULL_DAY",
        endPeriod: allowsHalfDay ? editEndPeriod : "FULL_DAY",
      });
      notify("Solicitud actualizada. Reenviála para volver a revisión.");
      onSaved();
    } catch (error) {
      onConflict(error);
    }
  };

  const handleResubmit = async () => {
    try {
      await resubmitMutation.mutateAsync();
      notify("Solicitud reenviada a revisión.");
      onSaved();
    } catch (error) {
      onConflict(error);
    }
  };

  return (
    <SectionCard title="Corrección administrativa (requiere información)">
      <Stack gap="md">
        <Alert color="blue">
          Corregí los datos como administrador y usá Reenviar para volver a dejar la solicitud
          pendiente de revisión.
        </Alert>
        <Select
          label="Tipo de ausencia"
          data={typeOptions.map(({ value, label, dayCountingMode }) => ({
            value,
            label:
              dayCountingMode === "BUSINESS_DAYS" ? `${label} (días hábiles)` : label,
          }))}
          value={editAbsenceTypeId}
          onChange={handleTypeChange}
          searchable
          disabled={updateMutation.isPending || resubmitMutation.isPending}
        />
        <Group grow preventGrowOverflow={false} align="flex-start">
          <TextInput
            label="Fecha de inicio"
            type="date"
            value={editStartDate}
            onChange={(event) => setEditStartDate(event.currentTarget.value)}
            disabled={updateMutation.isPending || resubmitMutation.isPending}
          />
          <TextInput
            label="Fecha de fin"
            type="date"
            value={editEndDate}
            onChange={(event) => setEditEndDate(event.currentTarget.value)}
            disabled={updateMutation.isPending || resubmitMutation.isPending}
          />
        </Group>
        {allowsHalfDay ? (
          <Group grow preventGrowOverflow={false} align="flex-start">
            <Select
              label="Período de inicio"
              data={PERIOD_OPTIONS}
              value={editStartPeriod}
              onChange={(value) => setEditStartPeriod((value as AbsenceDayPeriod) ?? "FULL_DAY")}
              disabled={updateMutation.isPending || resubmitMutation.isPending}
            />
            <Select
              label="Período de fin"
              data={PERIOD_OPTIONS}
              value={editEndPeriod}
              onChange={(value) => setEditEndPeriod((value as AbsenceDayPeriod) ?? "FULL_DAY")}
              disabled={updateMutation.isPending || resubmitMutation.isPending}
            />
          </Group>
        ) : null}

        <AbsenceDurationPreviewPanel query={previewQuery} />

        <Textarea
          label="Motivo"
          value={editReason}
          onChange={(event) => setEditReason(event.currentTarget.value)}
          minRows={3}
          disabled={updateMutation.isPending || resubmitMutation.isPending}
        />
        <Group gap="sm">
          <Button
            variant="default"
            onClick={() => void handleSaveNeedsInfoEdit()}
            loading={updateMutation.isPending}
            disabled={resubmitMutation.isPending}
          >
            Guardar cambios
          </Button>
          <Button
            onClick={() => void handleResubmit()}
            loading={resubmitMutation.isPending}
            disabled={updateMutation.isPending}
          >
            Reenviar a revisión
          </Button>
        </Group>
      </Stack>
    </SectionCard>
  );
}
