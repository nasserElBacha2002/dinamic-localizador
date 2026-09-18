import { Button, Group, Radio, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { ResponsiveModal } from "../../design-system";
import type {
  ManualAttendanceKind,
  ManualAttendancePreview,
} from "../../types/attendance";
import {
  datetimeLocalToIso,
  getCurrentDatetimeLocal,
  isoToDatetimeLocal,
} from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import { previewManualAttendance } from "../../api/attendance.api";

export interface ManualAttendanceDialogTarget {
  kind: ManualAttendanceKind;
  mode: "create" | "edit";
  operationId: string;
  employeeId: string;
  employeeWorkdayId?: string | null;
  attendanceId?: string | null;
  employeeName?: string;
  initialOccurredAt?: string | null;
  /** Required for edit optimistic concurrency. */
  expectedOccurredAt?: string | null;
}

interface ManualAttendanceDialogProps {
  open: boolean;
  target: ManualAttendanceDialogTarget | null;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (input: {
    kind: ManualAttendanceKind;
    mode: "create" | "edit";
    operationId: string;
    employeeId: string;
    employeeWorkdayId?: string;
    attendanceId?: string;
    occurredAt: string;
    expectedOccurredAt?: string;
    reason: string;
    comment: string | null;
  }) => Promise<void>;
}

function titleFor(target: ManualAttendanceDialogTarget): string {
  const isArrival = target.kind === "CHECK_IN";
  if (target.mode === "edit") {
    return isArrival ? "Editar llegada" : "Editar salida";
  }
  return isArrival ? "Registrar llegada" : "Registrar salida";
}

function dialogInstanceKey(target: ManualAttendanceDialogTarget | null): string {
  if (!target) {
    return "closed";
  }
  return [
    target.kind,
    target.mode,
    target.operationId,
    target.employeeId,
    target.attendanceId ?? "none",
    target.initialOccurredAt ?? "now",
  ].join(":");
}

function ManualAttendanceDialogBody({
  open,
  target,
  loading = false,
  onClose,
  onConfirm,
}: ManualAttendanceDialogProps & { target: ManualAttendanceDialogTarget }) {
  const [timeMode, setTimeMode] = useState<"now" | "custom">(
    target.initialOccurredAt ? "custom" : "now",
  );
  const [customLocal, setCustomLocal] = useState(
    target.initialOccurredAt
      ? isoToDatetimeLocal(target.initialOccurredAt)
      : getCurrentDatetimeLocal(),
  );
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [preview, setPreview] = useState<ManualAttendancePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    const run = async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const occurredAt =
          timeMode === "now"
            ? datetimeLocalToIso(getCurrentDatetimeLocal())
            : datetimeLocalToIso(customLocal);
        const data = await previewManualAttendance({
          kind: target.kind,
          operationId: target.operationId,
          employeeId: target.employeeId,
          employeeWorkdayId: target.employeeWorkdayId ?? undefined,
          attendanceId: target.attendanceId ?? undefined,
          occurredAt,
        });
        if (!cancelled) {
          setPreview(data);
        }
      } catch (error) {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(getApiErrorMessage(error, "No se pudo calcular el estado."));
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    };

    const timer = window.setTimeout(() => {
      void run();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, target, timeMode, customLocal]);

  const handleClose = () => {
    if (loading) {
      return;
    }
    onClose();
  };

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setFormError("El motivo es obligatorio.");
      return;
    }
    if (timeMode === "custom" && !customLocal) {
      setFormError("Ingresá una fecha y hora.");
      return;
    }

    setFormError(null);
    const occurredAt =
      timeMode === "now"
        ? datetimeLocalToIso(getCurrentDatetimeLocal())
        : datetimeLocalToIso(customLocal);

    await onConfirm({
      kind: target.kind,
      mode: target.mode,
      operationId: target.operationId,
      employeeId: target.employeeId,
      employeeWorkdayId: target.employeeWorkdayId ?? undefined,
      attendanceId: target.attendanceId ?? undefined,
      occurredAt,
      expectedOccurredAt: target.expectedOccurredAt ?? undefined,
      reason: reason.trim(),
      comment: comment.trim() ? comment.trim() : null,
    });
  };

  return (
    <ResponsiveModal
      opened={open}
      onClose={handleClose}
      title={titleFor(target)}
      size="md"
      bodyMode="normal"
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      footer={
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={() => void handleConfirm()} loading={loading}>
            Guardar
          </Button>
        </Group>
      }
    >
      <Stack gap="sm">
        {target.employeeName ? (
          <Text size="sm" c="dimmed">
            Colaborador: {target.employeeName}
          </Text>
        ) : null}

        <Radio.Group
          label="Fecha y hora"
          value={timeMode}
          onChange={(value) => setTimeMode(value as "now" | "custom")}
        >
          <Group mt="xs">
            <Radio value="now" label="Usar hora actual" disabled={loading} />
            <Radio value="custom" label="Ingresar fecha/hora" disabled={loading} />
          </Group>
        </Radio.Group>

        {timeMode === "custom" ? (
          <TextInput
            type="datetime-local"
            label="Fecha y hora efectiva"
            value={customLocal}
            onChange={(event) => setCustomLocal(event.currentTarget.value)}
            disabled={loading}
            required
          />
        ) : null}

        <Textarea
          label="Motivo"
          description="Obligatorio. Explicá por qué se registra o corrige manualmente."
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
          minRows={2}
          disabled={loading}
          required
          error={formError && !reason.trim() ? formError : undefined}
        />

        <Textarea
          label="Comentario"
          description="Opcional"
          value={comment}
          onChange={(event) => setComment(event.currentTarget.value)}
          minRows={2}
          disabled={loading}
        />

        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Estado calculado
          </Text>
          {previewLoading ? (
            <Text size="sm" c="dimmed">
              Calculando…
            </Text>
          ) : previewError ? (
            <Text size="sm" c="red">
              {previewError}
            </Text>
          ) : preview ? (
            <Text size="sm">Estado calculado: {preview.uiStatusLabel}</Text>
          ) : (
            <Text size="sm" c="dimmed">
              —
            </Text>
          )}
        </Stack>

        {formError && reason.trim() ? (
          <Text size="sm" c="red">
            {formError}
          </Text>
        ) : null}
      </Stack>
    </ResponsiveModal>
  );
}

export function ManualAttendanceDialog({
  open,
  target,
  loading = false,
  onClose,
  onConfirm,
}: ManualAttendanceDialogProps) {
  if (!target) {
    return null;
  }

  return (
    <ManualAttendanceDialogBody
      key={dialogInstanceKey(target)}
      open={open}
      target={target}
      loading={loading}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
