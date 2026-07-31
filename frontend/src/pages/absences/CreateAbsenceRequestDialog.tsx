import {
  Button,
  FileButton,
  Group,
  Progress,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { EmployeeSearchAutocomplete } from "../../components/employees/EmployeeSearchAutocomplete";
import { AbsenceDurationPreviewPanel } from "../../components/absences/AbsenceDurationPreviewPanel";
import { ResponsiveModal } from "../../design-system";
import { absenceAttachmentKeys } from "../../api/absence-query-keys";
import {
  createAbsenceRequestDraft,
  submitAbsenceRequestDraft,
  uploadAbsenceDraftAttachment,
} from "../../api/absences.api";
import { useAbsenceDurationPreview } from "../../hooks/useAbsenceCalendar";
import { useCreateAbsenceRequest } from "../../hooks/useAbsences";
import { useOperationalQueryEnabled } from "../../hooks/useOperationalQueryEnabled";
import type { AbsenceAttachmentPolicy, AbsenceDayPeriod } from "../../types/absence";
import { getApiErrorMessage } from "../../utils/errors";

const PERIOD_OPTIONS: Array<{ value: AbsenceDayPeriod; label: string }> = [
  { value: "FULL_DAY", label: "Día completo" },
  { value: "AM", label: "Mañana (AM)" },
  { value: "PM", label: "Tarde (PM)" },
];

const ACCEPTED_TYPES = "application/pdf,image/jpeg,image/png,image/webp";

function resolvePolicy(
  policy: AbsenceAttachmentPolicy | null | undefined,
  requiresAttachment?: boolean,
): AbsenceAttachmentPolicy {
  if (policy) {
    return policy;
  }
  return requiresAttachment ? "REQUIRED" : "OPTIONAL";
}

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
    attachmentPolicy?: AbsenceAttachmentPolicy;
    requiresAttachment?: boolean;
  }>;
  onCreated: () => void;
}) {
  const createMutation = useCreateAbsenceRequest();
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [absenceTypeId, setAbsenceTypeId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startPeriod, setStartPeriod] = useState<AbsenceDayPeriod>("FULL_DAY");
  const [endPeriod, setEndPeriod] = useState<AbsenceDayPeriod>("FULL_DAY");
  const [reason, setReason] = useState("");
  const [pendingFiles, setPendingFiles] = useState<
    Array<{ file: File; idempotencyKey: string }>
  >([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedType = useMemo(
    () => typeOptions.find((option) => option.value === absenceTypeId),
    [absenceTypeId, typeOptions],
  );
  const allowsHalfDay = selectedType?.allowsHalfDay === true;
  const attachmentPolicy = resolvePolicy(
    selectedType?.attachmentPolicy,
    selectedType?.requiresAttachment,
  );
  const allowsAttachment = attachmentPolicy !== "FORBIDDEN";

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
    if (resolvePolicy(next?.attachmentPolicy, next?.requiresAttachment) === "FORBIDDEN") {
      setPendingFiles([]);
    }
  };

  const resetForm = () => {
    setEmployeeId(null);
    setAbsenceTypeId(null);
    setStartDate("");
    setEndDate("");
    setStartPeriod("FULL_DAY");
    setEndPeriod("FULL_DAY");
    setReason("");
    setPendingFiles([]);
    setUploadProgress(null);
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
    if (attachmentPolicy === "REQUIRED" && pendingFiles.length === 0) {
      notifications.show({
        color: "red",
        message: "Este tipo de ausencia requiere documentación adjunta.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        employeeId,
        absenceTypeId,
        startDate,
        endDate,
        startPeriod: allowsHalfDay ? startPeriod : ("FULL_DAY" as const),
        endPeriod: allowsHalfDay ? endPeriod : ("FULL_DAY" as const),
        reason: reason.trim(),
      };

      // Draft → upload → submit when attachments are allowed (avoids auto-approve without docs).
      if (allowsAttachment && (attachmentPolicy === "REQUIRED" || pendingFiles.length > 0)) {
        const draft = await createAbsenceRequestDraft(payload);
        setUploadProgress(0);
        try {
          for (const [index, item] of pendingFiles.entries()) {
            await uploadAbsenceDraftAttachment(
              draft.id,
              item.file,
              item.idempotencyKey,
              (percent) => {
                const base = (index / pendingFiles.length) * 100;
                const slice = percent / pendingFiles.length;
                setUploadProgress(Math.round(base + slice));
              },
            );
          }
          await submitAbsenceRequestDraft(draft.id, crypto.randomUUID());
        } catch (error) {
          notifications.show({
            color: "red",
            message: getApiErrorMessage(error),
          });
          return;
        } finally {
          setUploadProgress(null);
        }
        if (companyId) {
          void queryClient.invalidateQueries({
            queryKey: absenceAttachmentKeys.storageHealth(companyId),
          });
        }
      } else {
        await createMutation.mutateAsync(payload);
      }

      notifications.show({ color: "green", message: "Solicitud creada." });
      onCreated();
      resetForm();
      onClose();
    } catch (error) {
      notifications.show({ color: "red", message: getApiErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || createMutation.isPending;

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
          disabled={busy}
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
          disabled={busy}
        />
        <Group grow preventGrowOverflow={false} align="flex-start">
          <TextInput
            label="Fecha de inicio"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.currentTarget.value)}
            disabled={busy}
          />
          <TextInput
            label="Fecha de fin"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.currentTarget.value)}
            disabled={busy}
          />
        </Group>
        {allowsHalfDay ? (
          <Group grow preventGrowOverflow={false} align="flex-start">
            <Select
              label="Período de inicio"
              data={PERIOD_OPTIONS}
              value={startPeriod}
              onChange={(value) => setStartPeriod((value as AbsenceDayPeriod) ?? "FULL_DAY")}
              disabled={busy}
            />
            <Select
              label="Período de fin"
              data={PERIOD_OPTIONS}
              value={endPeriod}
              onChange={(value) => setEndPeriod((value as AbsenceDayPeriod) ?? "FULL_DAY")}
              disabled={busy}
            />
          </Group>
        ) : null}
        <AbsenceDurationPreviewPanel query={previewQuery} />
        <Textarea
          label="Motivo"
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
          minRows={3}
          disabled={busy}
        />
        {allowsAttachment ? (
          <Stack gap="xs">
            <Group gap="sm" align="center">
              <FileButton
                onChange={(file) => {
                  if (!file) {
                    return;
                  }
                  setPendingFiles((prev) => [
                    ...prev,
                    { file, idempotencyKey: crypto.randomUUID() },
                  ]);
                }}
                accept={ACCEPTED_TYPES}
                disabled={busy}
              >
                {(props) => (
                  <Button {...props} variant="light" size="sm" disabled={busy}>
                    {attachmentPolicy === "REQUIRED"
                      ? "Adjuntar documentación (obligatorio)"
                      : "Adjuntar documentación (opcional)"}
                  </Button>
                )}
              </FileButton>
            </Group>
            {pendingFiles.map((item) => (
              <Group key={item.idempotencyKey} gap="xs">
                <Text size="sm">{item.file.name}</Text>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="red"
                  disabled={busy}
                  onClick={() =>
                    setPendingFiles((prev) =>
                      prev.filter((entry) => entry.idempotencyKey !== item.idempotencyKey),
                    )
                  }
                >
                  Quitar
                </Button>
              </Group>
            ))}
            {uploadProgress != null ? (
              <Stack gap={4}>
                <Text size="sm">Subiendo archivos… {uploadProgress}%</Text>
                <Progress value={uploadProgress} animated />
              </Stack>
            ) : null}
          </Stack>
        ) : null}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} loading={busy}>
            Crear solicitud
          </Button>
        </Group>
      </Stack>
    </ResponsiveModal>
  );
}
