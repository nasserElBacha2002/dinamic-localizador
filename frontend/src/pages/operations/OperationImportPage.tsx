import { Alert, Badge, Button, Group, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMemo, useRef, useState } from "react";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import {
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
  StatusBadge,
  type DataTableColumn,
} from "../../design-system";
import { useOperationImportConfirm, useOperationImportPreview } from "../../hooks/useOperationImport";
import type {
  OperationImportConfirmRow,
  OperationImportPreviewResult,
  OperationImportPreviewRow,
} from "../../types/operation-import";
import { formatDateTime } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import {
  INVENTORY_IMPORT_FORMAT_HELP,
  downloadOperationImportErrors,
  downloadRecommendedImportTemplate,
  isAcceptedImportFile,
  readFileAsBase64,
  UNSUPPORTED_IMPORT_FILE_MESSAGE,
} from "../../utils/operation-import-template";

function toConfirmRows(rows: OperationImportPreviewRow[]): OperationImportConfirmRow[] {
  return rows
    .filter((row) => row.status === "valid")
    .map((row) => ({
      serviceId: row.serviceId!,
      scheduledStart: row.scheduledStart!,
      scheduledEnd: row.scheduledEnd!,
      earlyToleranceMinutes: row.earlyToleranceMinutes!,
      lateToleranceMinutes: row.lateToleranceMinutes!,
      notes: row.notas.trim() ? row.notas.trim() : null,
    }));
}

function formatScheduledValue(row: OperationImportPreviewRow, kind: "start" | "end"): string {
  if (kind === "start") {
    if (row.scheduledStart) {
      return formatDateTime(row.scheduledStart);
    }
    return row.scheduledStartDisplay || row.fechaInicio || "—";
  }

  if (row.scheduledEnd) {
    return formatDateTime(row.scheduledEnd);
  }
  return row.scheduledEndDisplay || row.fechaFin || "—";
}

function buildPreviewColumns(isClientFormat: boolean): DataTableColumn<OperationImportPreviewRow>[] {
  const columns: DataTableColumn<OperationImportPreviewRow>[] = [
    { key: "rowNumber", header: "Fila", getValue: (row) => row.rowNumber, align: "right" },
    {
      key: "source",
      header: isClientFormat ? "PUNTO" : "Tienda",
      getValue: (row) => (isClientFormat ? row.punto || "—" : row.tienda || "—"),
    },
    { key: "serviceName", header: "Tienda resuelta", getValue: (row) => row.serviceName ?? "—" },
    { key: "rawFecha", header: isClientFormat ? "Fecha original" : "Inicio original", getValue: (row) => row.rawFecha || "—" },
  ];

  if (isClientFormat) {
    columns.push({
      key: "parsedOperationDate",
      header: "Fecha inventario",
      getValue: (row) => row.parsedOperationDate ?? "—",
    });
  }

  columns.push(
    {
      key: "scheduledStart",
      header: "Inicio calculado",
      render: (row) => (
        <Stack gap={2}>
          <Text size="sm">{formatScheduledValue(row, "start")}</Text>
          {row.scheduledStartDisplay ? (
            <Text size="xs" c="dimmed">
              {row.scheduledStartDisplay}
            </Text>
          ) : null}
        </Stack>
      ),
    },
    {
      key: "scheduledEnd",
      header: "Fin calculado",
      render: (row) => (
        <Stack gap={2}>
          <Text size="sm">{formatScheduledValue(row, "end")}</Text>
          {row.scheduledEndDisplay ? (
            <Text size="xs" c="dimmed">
              {row.scheduledEndDisplay}
            </Text>
          ) : null}
        </Stack>
      ),
    },
    { key: "earlyTolerance", header: "Temprana", getValue: (row) => row.earlyToleranceDisplay },
    { key: "lateTolerance", header: "Tardía", getValue: (row) => row.lateToleranceDisplay },
  );

  if (!isClientFormat) {
    columns.push({ key: "notas", header: "Notas", getValue: (row) => row.notas || "—" });
  }

  columns.push(
    {
      key: "status",
      header: "Estado",
      render: (row) => (
        <StatusBadge
          label={row.status === "valid" ? "Válida" : "Inválida"}
          tone={row.status === "valid" ? "success" : "danger"}
        />
      ),
    },
    {
      key: "errors",
      header: "Errores",
      getValue: (row) => ((row.errors?.length ?? 0) > 0 ? row.errors.join(" · ") : "—"),
    },
  );

  return columns;
}

export function OperationImportPage() {
  const { goBackToList } = useListBackNavigation("/operations");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewMutation = useOperationImportPreview();
  const confirmMutation = useOperationImportConfirm();

  const [preview, setPreview] = useState<OperationImportPreviewResult | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const handleFileSelect = async (file: File | null) => {
    setClientError(null);
    setPreview(null);

    if (!file) {
      setSelectedFileName(null);
      return;
    }

    if (!isAcceptedImportFile(file)) {
      setSelectedFileName(null);
      setPreview(null);
      setClientError(UNSUPPORTED_IMPORT_FILE_MESSAGE);
      return;
    }

    setSelectedFileName(file.name);

    try {
      const fileContentBase64 = await readFileAsBase64(file);
      const result = await previewMutation.mutateAsync({
        fileName: file.name,
        fileContentBase64,
      });
      setPreview(result);
    } catch (error) {
      setClientError(getApiErrorMessage(error, "No se pudo procesar el archivo."));
    }
  };

  const handleConfirm = async () => {
    if (!preview?.summary.canConfirm) {
      return;
    }

    try {
      const rows = toConfirmRows(preview.rows);
      await confirmMutation.mutateAsync(rows);
      notifications.show({
        color: "green",
        title: "Importación completada",
        message: "Inventarios importados correctamente.",
      });
      goBackToList();
    } catch (error) {
      notifications.show({
        color: "red",
        title: "Error de importación",
        message: getApiErrorMessage(error, "No se pudo completar la importación."),
      });
    }
  };

  const isClientFormat = preview?.format === "client";
  const hasImportErrors = (preview?.summary.invalidRows ?? 0) > 0;
  const invalidRows = useMemo(
    () => preview?.rows.filter((row) => row.status === "invalid") ?? [],
    [preview?.rows],
  );
  const previewColumns = useMemo(
    () => buildPreviewColumns(Boolean(isClientFormat)),
    [isClientFormat],
  );

  const handleDownloadErrors = () => {
    if (!preview || !selectedFileName || !hasImportErrors) {
      return;
    }

    downloadOperationImportErrors(selectedFileName, preview);
  };

  return (
    <Stack gap="md">
      <PageHeader
        title="Importar operaciones"
        description="Cargá un CSV o XLSX, revisá la vista previa y confirmá la importación."
        action={
          <Button variant="default" onClick={goBackToList}>
            Volver al listado
          </Button>
        }
      />

      <Alert color="blue" variant="light">
        Los horarios y tolerancias faltantes se completan usando la configuración de inventarios de
        la empresa.
      </Alert>

      <SectionCard title="Archivo" description="Paso 1 · Subí el archivo o descargá la plantilla recomendada.">
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {INVENTORY_IMPORT_FORMAT_HELP}
          </Text>

          <Group gap="sm" wrap="wrap">
            <Button onClick={() => fileInputRef.current?.click()} loading={previewMutation.isPending}>
              Cargar archivo
            </Button>
            <Button variant="default" onClick={downloadRecommendedImportTemplate}>
              Descargar plantilla
            </Button>
            <Button variant="default" onClick={handleDownloadErrors} disabled={!preview || !hasImportErrors}>
              Descargar errores
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                void handleFileSelect(file);
                event.target.value = "";
              }}
            />
          </Group>

          {selectedFileName ? (
            <Text size="sm">
              Archivo seleccionado: <strong>{selectedFileName}</strong>
            </Text>
          ) : null}
          {clientError ? <Alert color="red">{clientError}</Alert> : null}
        </Stack>
      </SectionCard>

      {previewMutation.isPending ? <LoadingState message="Validando archivo..." /> : null}

      {preview ? (
        <>
          {preview.fileErrors.length > 0 ? (
            <Alert color="red" title="Errores de archivo">
              <Stack gap={4}>
                {preview.fileErrors.map((error) => (
                  <Text key={error} size="sm">
                    {error}
                  </Text>
                ))}
              </Stack>
            </Alert>
          ) : null}

          {preview.rows.length > 0 ? (
            <>
              <SectionCard title="Vista previa" description="Paso 2 · Revisá filas válidas e inválidas antes de confirmar.">
                <Stack gap="md">
                  <Group gap="xs" wrap="wrap">
                    {preview.format ? (
                      <Badge variant="light">
                        Formato: {preview.format === "client" ? "PUNTO / Fecha" : "Extendido"}
                      </Badge>
                    ) : null}
                    {preview.fileType ? (
                      <Badge variant="light">Archivo: {preview.fileType.toUpperCase()}</Badge>
                    ) : null}
                    <Badge>Total: {preview.summary.totalRows}</Badge>
                    <Badge color="green" variant="light">
                      Válidas: {preview.summary.validRows}
                    </Badge>
                    <Badge color={preview.summary.invalidRows > 0 ? "red" : "gray"} variant="light">
                      Inválidas: {preview.summary.invalidRows}
                    </Badge>
                  </Group>

                  <DataTable
                    rows={preview.rows ?? []}
                    columns={previewColumns}
                    getRowKey={(row) => String(row.rowNumber)}
                    aria-label="Vista previa de importación de inventarios"
                  />
                </Stack>
              </SectionCard>

              {hasImportErrors ? (
                <SectionCard
                  title="Errores detectados"
                  description="Corregí las filas inválidas en el archivo y volvé a cargarlo."
                >
                  <DataTable
                    rows={invalidRows}
                    columns={previewColumns}
                    getRowKey={(row) => `invalid-${row.rowNumber}`}
                    emptyTitle="Sin filas inválidas"
                  />
                </SectionCard>
              ) : null}

              <SectionCard title="Confirmación" description="Paso 3 · Importá solo las filas válidas.">
                <Stack gap="sm">
                  <Button
                    onClick={() => void handleConfirm()}
                    disabled={!preview.summary.canConfirm || confirmMutation.isPending}
                    loading={confirmMutation.isPending}
                  >
                    Confirmar importación
                  </Button>
                  {!preview.summary.canConfirm ? (
                    <Text size="sm" c="dimmed">
                      Corregí todas las filas inválidas antes de confirmar la importación.
                    </Text>
                  ) : null}
                </Stack>
              </SectionCard>
            </>
          ) : preview.fileErrors.length === 0 ? (
            <ErrorState message="No se encontraron filas para importar." />
          ) : null}
        </>
      ) : (
        <EmptyState
          title="Sin vista previa"
          description="Cargá un archivo CSV o XLSX para validar y revisar las filas antes de importar."
        />
      )}
    </Stack>
  );
}
