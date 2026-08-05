import {
  Alert,
  Button,
  FileButton,
  Group,
  Progress,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";
import {
  DataTable,
  ResponsiveModal,
  StatusBadge,
  type DataTableColumn,
} from "../../design-system";
import {
  useCreatePayrollReceiptBatch,
  useUploadPayrollReceiptToBatch,
} from "../../hooks/usePayrollReceipts";
import type { PayrollReceiptListItem, PayrollReceiptStatus } from "../../types/payroll-receipt";
import { getApiErrorMessage } from "../../utils/errors";
import {
  formatCuilDisplay,
  PAYROLL_MONTH_LABELS,
  payrollReceiptStatusLabels,
  payrollReceiptStatusTone,
  payrollUploadCompletionMessage,
  previewCuilFromFilename,
  summarizePayrollUploadOutcomes,
} from "../../utils/payroll-receipt-labels";

const ACCEPTED_TYPES = "application/pdf";

type PendingFile = {
  localId: string;
  file: File;
  /** Stable for retries of the same logical upload attempt. */
  idempotencyKey: string;
  previewCuil: string | null;
  progress: number | null;
  result: PayrollReceiptListItem | null;
  error: string | null;
};

type UploadResultRow = {
  id: string;
  filename: string;
  previewCuil: string | null;
  status: PayrollReceiptStatus | "ERROR" | "PENDING";
  message: string | null;
};

function buildYearOptions(): Array<{ value: string; label: string }> {
  const current = new Date().getFullYear();
  const years: Array<{ value: string; label: string }> = [];
  for (let year = current + 1; year >= current - 10; year -= 1) {
    years.push({ value: String(year), label: String(year) });
  }
  return years;
}

const MONTH_OPTIONS = Object.entries(PAYROLL_MONTH_LABELS).map(([value, label]) => ({
  value,
  label,
}));

interface UploadPayrollReceiptsDialogProps {
  opened: boolean;
  onClose: () => void;
}

export function UploadPayrollReceiptsDialog({ opened, onClose }: UploadPayrollReceiptsDialogProps) {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [uploadFinished, setUploadFinished] = useState(false);

  const createBatch = useCreatePayrollReceiptBatch();
  const uploadFile = useUploadPayrollReceiptToBatch();

  const yearOptions = useMemo(() => buildYearOptions(), []);

  const resultRows = useMemo<UploadResultRow[]>(
    () =>
      files.map((item) => ({
        id: item.localId,
        filename: item.file.name,
        previewCuil: item.previewCuil,
        status: item.error
          ? "ERROR"
          : item.result
            ? item.result.status
            : "PENDING",
        message: item.error ?? item.result?.errorMessage ?? null,
      })),
    [files],
  );

  const uploadSummary = useMemo(
    () =>
      summarizePayrollUploadOutcomes(
        files.map((item) =>
          item.error ? "ERROR" : item.result ? item.result.status : "PENDING",
        ),
      ),
    [files],
  );
  const completionAlert = useMemo(
    () => payrollUploadCompletionMessage(uploadSummary),
    [uploadSummary],
  );
  const hasUnresolvedIssues =
    uploadSummary.failed > 0 ||
    uploadSummary.networkErrors > 0 ||
    uploadSummary.duplicates > 0 ||
    uploadSummary.associated < uploadSummary.total;
  const allDone = uploadFinished && files.length > 0;

  const resultColumns = useMemo<DataTableColumn<UploadResultRow>[]>(
    () => [
      { key: "filename", header: "Archivo", getValue: (row) => row.filename },
      {
        key: "cuil",
        header: "CUIL (vista previa)",
        getValue: (row) => formatCuilDisplay(row.previewCuil),
      },
      {
        key: "status",
        header: "Estado",
        render: (row) => {
          if (row.status === "ERROR") {
            return <StatusBadge label="Error" tone="danger" variant="light" />;
          }
          if (row.status === "PENDING") {
            return <StatusBadge label="Pendiente" tone="neutral" variant="light" />;
          }
          return (
            <StatusBadge
              label={payrollReceiptStatusLabels[row.status]}
              tone={payrollReceiptStatusTone(row.status)}
              variant="light"
            />
          );
        },
      },
      {
        key: "message",
        header: "Detalle",
        getValue: (row) => row.message ?? "—",
      },
    ],
    [],
  );

  const addFiles = (selected: File | File[] | null) => {
    if (!selected) {
      return;
    }
    const list = Array.isArray(selected) ? selected : [selected];
    const pdfs = list.filter(
      (file) =>
        file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"),
    );
    if (pdfs.length === 0) {
      notifications.show({
        color: "red",
        message: "Solo se admiten archivos PDF.",
      });
      return;
    }
    setUploadFinished(false);
    setBatchError(null);
    setFiles((prev) => [
      ...prev,
      ...pdfs.map((file) => ({
        localId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        file,
        previewCuil: previewCuilFromFilename(file.name),
        progress: null,
        result: null,
        error: null,
      })),
    ]);
  };

  const removeFile = (localId: string) => {
    if (busy) {
      return;
    }
    setFiles((prev) => prev.filter((item) => item.localId !== localId));
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      notifications.show({ color: "red", message: "Seleccioná al menos un PDF." });
      return;
    }
    const parsedYear = Number.parseInt(year, 10);
    const parsedMonth = Number.parseInt(month, 10);
    if (!Number.isFinite(parsedYear) || !Number.isFinite(parsedMonth)) {
      notifications.show({ color: "red", message: "Seleccioná año y mes." });
      return;
    }

    setBusy(true);
    setBatchError(null);
    setUploadFinished(false);

    try {
      const batch = await createBatch.mutateAsync({
        year: parsedYear,
        month: parsedMonth,
      });

      for (const item of files) {
        setFiles((prev) =>
          prev.map((entry) =>
            entry.localId === item.localId
              ? { ...entry, progress: 0, error: null, result: null }
              : entry,
          ),
        );
        try {
          const result = await uploadFile.mutateAsync({
            batchId: batch.id,
            file: item.file,
            idempotencyKey: item.idempotencyKey,
            onUploadProgress: (percent) => {
              setFiles((prev) =>
                prev.map((entry) =>
                  entry.localId === item.localId ? { ...entry, progress: percent } : entry,
                ),
              );
            },
          });
          setFiles((prev) =>
            prev.map((entry) =>
              entry.localId === item.localId
                ? { ...entry, progress: 100, result, error: null }
                : entry,
            ),
          );
        } catch (error) {
          setFiles((prev) =>
            prev.map((entry) =>
              entry.localId === item.localId
                ? {
                    ...entry,
                    progress: null,
                    error: getApiErrorMessage(error, "No se pudo subir el archivo."),
                  }
                : entry,
            ),
          );
        }
      }

      setUploadFinished(true);
    } catch (error) {
      setBatchError(getApiErrorMessage(error, "No se pudo crear el lote de carga."));
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (busy) {
      return;
    }
    onClose();
  };

  return (
    <ResponsiveModal
      opened={opened}
      onClose={handleClose}
      title="Subir recibos de sueldo"
      size="xl"
      closeOnClickOutside={!busy && !hasUnresolvedIssues}
      closeOnEscape={!busy}
    >
      <Stack gap="md">
        <Group grow preventGrowOverflow={false} align="flex-start">
          <Select
            label="Año"
            data={yearOptions}
            value={year}
            onChange={(value) => setYear(value ?? String(now.getFullYear()))}
            disabled={busy || allDone}
            searchable
          />
          <Select
            label="Mes"
            data={MONTH_OPTIONS}
            value={month}
            onChange={(value) => setMonth(value ?? String(now.getMonth() + 1))}
            disabled={busy || allDone}
          />
        </Group>

        <Group gap="sm" align="center">
          <FileButton onChange={addFiles} accept={ACCEPTED_TYPES} multiple disabled={busy || allDone}>
            {(props) => (
              <Button {...props} variant="light" disabled={busy || allDone}>
                Seleccionar PDFs
              </Button>
            )}
          </FileButton>
          <Text size="sm" c="dimmed">
            {files.length === 0
              ? "Ningún archivo seleccionado"
              : `${files.length} archivo${files.length === 1 ? "" : "s"}`}
          </Text>
        </Group>

        {files.length > 0 && !uploadFinished ? (
          <Stack gap="xs">
            {files.map((item) => (
              <Stack key={item.localId} gap={4}>
                <Group justify="space-between" gap="sm" wrap="nowrap">
                  <Stack gap={0} style={{ minWidth: 0 }}>
                    <Text size="sm" truncate>
                      {item.file.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      CUIL detectado: {formatCuilDisplay(item.previewCuil)}
                    </Text>
                  </Stack>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="red"
                    disabled={busy}
                    onClick={() => removeFile(item.localId)}
                  >
                    Quitar
                  </Button>
                </Group>
                {item.progress != null ? (
                  <Progress value={item.progress} animated={item.progress < 100} />
                ) : null}
              </Stack>
            ))}
          </Stack>
        ) : null}

        {batchError ? <Alert color="red">{batchError}</Alert> : null}

        {uploadFinished ? (
          <Stack gap="sm">
            <Alert color={completionAlert.color}>{completionAlert.message}</Alert>
            <Text size="sm" c="dimmed">
              Asociados: {uploadSummary.associated} · Duplicados: {uploadSummary.duplicates} ·
              Fallidos: {uploadSummary.failed + uploadSummary.networkErrors}
            </Text>
            <DataTable
              rows={resultRows}
              columns={resultColumns}
              getRowKey={(row) => row.id}
              emptyTitle="Sin resultados"
              aria-label="Resultados de carga de recibos"
            />
          </Stack>
        ) : null}

        <Group justify="flex-end">
          <Button variant="default" onClick={handleClose} disabled={busy}>
            {allDone ? "Cerrar" : "Cancelar"}
          </Button>
          {!allDone ? (
            <Button onClick={() => void handleUpload()} loading={busy} disabled={files.length === 0}>
              Subir
            </Button>
          ) : null}
        </Group>
      </Stack>
    </ResponsiveModal>
  );
}
