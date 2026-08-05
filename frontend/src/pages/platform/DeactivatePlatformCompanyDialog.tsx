import { Alert, Button, Group, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { ResponsiveModal } from "../../design-system";
import type { PlatformCompany } from "../../types/platform-company";

interface DeactivatePlatformCompanyDialogProps {
  open: boolean;
  company: PlatformCompany | null;
  gracePeriodDays: number;
  loading?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}

function formatScheduledDeletion(days: number): string {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return date.toLocaleString("es-AR", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

export function DeactivatePlatformCompanyDialog({
  open,
  company,
  gracePeriodDays,
  loading = false,
  errorMessage,
  onClose,
  onConfirm,
}: DeactivatePlatformCompanyDialogProps) {
  const [reason, setReason] = useState("");
  const [confirmName, setConfirmName] = useState("");

  useEffect(() => {
    if (!open) {
      setReason("");
      setConfirmName("");
    }
  }, [open]);

  const estimatedDeletion = useMemo(
    () => formatScheduledDeletion(gracePeriodDays),
    [gracePeriodDays],
  );

  const nameMatches =
    Boolean(company) && confirmName.trim() === (company?.name ?? "").trim();
  const canSubmit = nameMatches && reason.trim().length >= 5 && !loading;

  return (
    <ResponsiveModal
      opened={open}
      onClose={loading ? () => undefined : onClose}
      title="Desactivar empresa"
      size="md"
      bodyMode="normal"
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      footer={
        <Group justify="flex-end" gap="sm" wrap="wrap">
          <Button variant="default" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            color="danger"
            disabled={!canSubmit}
            loading={loading}
            onClick={() => void onConfirm(reason.trim())}
          >
            Desactivar empresa
          </Button>
        </Group>
      }
    >
      <Stack gap="md">
        {errorMessage ? <Alert color="red">{errorMessage}</Alert> : null}
        <Text size="sm">
          Vas a desactivar <strong>{company?.name}</strong>. Los usuarios perderán acceso
          operativo, los procesos automáticos y el bot de WhatsApp quedarán bloqueados, y la
          empresa se eliminará definitivamente al finalizar el período de gracia (
          {gracePeriodDays} días). Fecha estimada de eliminación:{" "}
          <strong>{estimatedDeletion}</strong> (la fecha exacta la confirma el servidor al
          desactivar).
        </Text>
        <Text size="sm" c="dimmed">
          Podés revertir la acción reactivando la empresa antes de que comience la eliminación.
          La eliminación no se ejecuta de inmediato al desactivar.
        </Text>
        <Textarea
          label="Motivo de desactivación"
          description="Obligatorio. Se registra en auditoría."
          required
          minRows={3}
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
          placeholder="Ej.: Falta de pago o solicitud administrativa"
        />
        <TextInput
          label={`Escribí el nombre de la empresa para confirmar (${company?.name ?? ""})`}
          required
          value={confirmName}
          onChange={(event) => setConfirmName(event.currentTarget.value)}
          autoComplete="off"
        />
      </Stack>
    </ResponsiveModal>
  );
}
