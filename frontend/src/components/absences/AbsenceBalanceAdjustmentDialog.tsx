import { Alert, Button, Group, NumberInput, Select, Stack, Text, Textarea } from "@mantine/core";
import { useState } from "react";
import { ResponsiveModal } from "../../design-system";
import type {
  AbsenceBalanceAdjustmentOperation,
  EmployeeAbsenceBalanceSummary,
} from "../../types/absence";

interface AbsenceBalanceAdjustmentDialogProps {
  opened: boolean;
  year: number;
  target: EmployeeAbsenceBalanceSummary | null;
  loading?: boolean;
  error?: string | null;
  commandId: string;
  onClose: () => void;
  onConfirm: (input: {
    operation: AbsenceBalanceAdjustmentOperation;
    quantity: number;
    reason: string;
    idempotencyKey: string;
  }) => void;
}

function AbsenceBalanceAdjustmentDialogForm({
  year,
  target,
  loading = false,
  error = null,
  commandId,
  onClose,
  onConfirm,
}: Omit<AbsenceBalanceAdjustmentDialogProps, "opened">) {
  const [operation, setOperation] = useState<AbsenceBalanceAdjustmentOperation>("CREDIT");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleConfirm = () => {
    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setLocalError("La cantidad debe ser un número mayor a 0.");
      return;
    }
    if (!reason.trim()) {
      setLocalError("El motivo es obligatorio.");
      return;
    }
    onConfirm({
      operation,
      quantity: parsedQuantity,
      reason: reason.trim(),
      idempotencyKey: commandId,
    });
  };

  return (
    <ResponsiveModal
      opened
      onClose={loading ? () => undefined : onClose}
      title={`Ajustar saldo · ${target?.absenceType.name ?? ""} · ${year}`}
      bodyMode="normal"
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      footer={
        <Group justify="flex-end" gap="sm" wrap="wrap">
          <Button variant="default" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} loading={loading}>
            Confirmar ajuste
          </Button>
        </Group>
      }
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Disponibles actuales: {target?.availableDays ?? "—"} · Otorgados:{" "}
          {target?.grantedDays ?? target?.assignedDays ?? "—"}
        </Text>
        <Select
          label="Operación"
          data={[
            { value: "CREDIT", label: "Agregar días" },
            { value: "DEBIT", label: "Descontar días" },
          ]}
          value={operation}
          onChange={(value) =>
            setOperation((value as AbsenceBalanceAdjustmentOperation | null) ?? "CREDIT")
          }
          disabled={loading}
        />
        <NumberInput
          label="Cantidad"
          value={quantity === "" ? "" : Number(quantity)}
          onChange={(value) => setQuantity(value === "" || value === undefined ? "" : String(value))}
          min={0.5}
          step={0.5}
          decimalScale={1}
          disabled={loading}
        />
        <Textarea
          label="Motivo"
          description="Obligatorio. Queda registrado en el historial de movimientos."
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
          minRows={2}
          required
          disabled={loading}
        />
        {localError || error ? <Alert color="red">{localError ?? error}</Alert> : null}
      </Stack>
    </ResponsiveModal>
  );
}

export function AbsenceBalanceAdjustmentDialog({
  opened,
  year,
  target,
  loading = false,
  error = null,
  commandId,
  onClose,
  onConfirm,
}: AbsenceBalanceAdjustmentDialogProps) {
  if (!opened || !target) {
    return null;
  }

  return (
    <AbsenceBalanceAdjustmentDialogForm
      key={`${target.absenceType.id}-${commandId}`}
      year={year}
      target={target}
      loading={loading}
      error={error}
      commandId={commandId}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
