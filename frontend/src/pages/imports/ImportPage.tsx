import { Alert, Badge, Button, Group, SegmentedControl, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { downloadImportTemplate } from "../../api/imports.api";
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
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useImportExecute, useImportPreview } from "../../hooks/useImport";
import {
  getImportEntityStrategy,
  IMPORT_ENTITY_STRATEGIES,
  isImportEntityType,
} from "../../imports/entity-strategies";
import type {
  ImportEntityType,
  ImportExecuteResult,
  ImportPreviewResult,
  ImportPreviewRow,
} from "../../types/import";
import { getApiErrorMessage } from "../../utils/errors";
import {
  downloadImportRejectedRows,
  isAcceptedImportFile,
  readFileAsBase64,
  triggerBlobDownload,
  UNSUPPORTED_IMPORT_FILE_MESSAGE,
} from "../../utils/import-file";
import { hasPermission } from "../../utils/permissions";

type RowFilter = "all" | "valid" | "invalid";

function buildColumns(
  preview: ImportPreviewResult,
): DataTableColumn<ImportPreviewRow>[] {
  const columns: DataTableColumn<ImportPreviewRow>[] = [
    { key: "rowNumber", header: "Fila", getValue: (row) => row.rowNumber, align: "right" },
  ];

  for (const column of preview.displayColumns) {
    columns.push({
      key: column.key,
      header: column.header,
      getValue: (row) => row.values[column.key] || "—",
    });
  }

  columns.push(
    {
      key: "status",
      header: "Estado",
      render: (row) => (
        <StatusBadge
          label={row.status === "valid" ? "Válida" : row.status === "warning" ? "Advertencia" : "Inválida"}
          tone={row.status === "valid" ? "success" : row.status === "warning" ? "warning" : "danger"}
        />
      ),
    },
    {
      key: "errors",
      header: "Errores",
      getValue: (row) =>
        row.errors.length > 0 ? row.errors.map((error) => error.message).join(" · ") : "—",
    },
  );

  return columns;
}

export function ImportPage() {
  const permissionsQuery = useCompanyPermissions();
  const permissions = permissionsQuery.data?.permissions;
  const [searchParams, setSearchParams] = useSearchParams();
  const availableStrategies = IMPORT_ENTITY_STRATEGIES.filter((strategy) =>
    hasPermission(permissions, strategy.permission),
  );

  const requestedEntity = searchParams.get("entity");
  const initialEntity: ImportEntityType =
    isImportEntityType(requestedEntity) &&
    availableStrategies.some((strategy) => strategy.entityType === requestedEntity)
      ? requestedEntity
      : (availableStrategies[0]?.entityType ?? "operations");

  const [entityType, setEntityType] = useState<ImportEntityType>(initialEntity);
  const strategy = getImportEntityStrategy(entityType);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewMutation = useImportPreview(entityType);
  const executeMutation = useImportExecute(entityType);

  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [executeResult, setExecuteResult] = useState<ImportExecuteResult | null>(null);
  const [pendingFile, setPendingFile] = useState<{ name: string; contentBase64: string } | null>(
    null,
  );
  const [clientError, setClientError] = useState<string | null>(null);
  const [rowFilter, setRowFilter] = useState<RowFilter>("all");
  const [templateLoading, setTemplateLoading] = useState(false);

  const handleEntityChange = (next: string) => {
    if (!isImportEntityType(next)) {
      return;
    }
    setEntityType(next);
    setSearchParams({ entity: next });
    setPreview(null);
    setExecuteResult(null);
    setPendingFile(null);
    setClientError(null);
    setRowFilter("all");
  };

  const handleFileSelect = async (file: File | null) => {
    setClientError(null);
    setPreview(null);
    setExecuteResult(null);

    if (!file) {
      setPendingFile(null);
      return;
    }

    if (!isAcceptedImportFile(file)) {
      setPendingFile(null);
      setClientError(UNSUPPORTED_IMPORT_FILE_MESSAGE);
      return;
    }

    try {
      const fileContentBase64 = await readFileAsBase64(file);
      setPendingFile({ name: file.name, contentBase64: fileContentBase64 });
      const result = await previewMutation.mutateAsync({
        fileName: file.name,
        fileContentBase64,
      });
      setPreview(result);
    } catch (error) {
      setClientError(getApiErrorMessage(error, "No se pudo procesar el archivo."));
    }
  };

  const handleDownloadTemplate = async () => {
    setTemplateLoading(true);
    try {
      const blob = await downloadImportTemplate(entityType);
      triggerBlobDownload(blob, strategy.templateFileName);
    } catch (error) {
      notifications.show({
        color: "red",
        message: getApiErrorMessage(error, "No se pudo descargar la plantilla."),
      });
    } finally {
      setTemplateLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview?.summary.canConfirm || !pendingFile) {
      return;
    }

    try {
      const result = await executeMutation.mutateAsync({
        fileName: pendingFile.name,
        fileContentBase64: pendingFile.contentBase64,
      });
      setExecuteResult(result);
      notifications.show({
        color: "green",
        title: "Importación completada",
        message: `${strategy.successMessage} Creadas: ${result.summary.created}. Rechazadas: ${result.summary.rejected}.`,
      });
    } catch (error) {
      notifications.show({
        color: "red",
        title: "Error de importación",
        message: getApiErrorMessage(error, "No se pudo completar la importación."),
      });
    }
  };

  const filteredRows = useMemo(() => {
    if (!preview) {
      return [];
    }
    if (rowFilter === "valid") {
      return preview.rows.filter((row) => row.status === "valid");
    }
    if (rowFilter === "invalid") {
      return preview.rows.filter((row) => row.status === "invalid" || row.status === "warning");
    }
    return preview.rows;
  }, [preview, rowFilter]);

  const previewColumns = useMemo(
    () => (preview ? buildColumns(preview) : []),
    [preview],
  );

  if (permissionsQuery.isLoading) {
    return <LoadingState />;
  }

  if (availableStrategies.length === 0) {
    return <ErrorState message="No tenés permisos para importar entidades." />;
  }

  return (
    <Stack gap="md">
      <PageHeader title="Importaciones" description="Carga masiva por archivo de operaciones, servicios o colaboradores." />

      <SectionCard title="Tipo de importación">
        <SegmentedControl
          fullWidth
          value={entityType}
          onChange={handleEntityChange}
          data={availableStrategies.map((item) => ({
            value: item.entityType,
            label: item.label,
          }))}
        />
      </SectionCard>

      <Alert color="blue" variant="light">
        {strategy.help}
      </Alert>

      <SectionCard title="Archivo" description={`Paso 1 · ${strategy.title}`}>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {strategy.description}
          </Text>
          <Group gap="sm" wrap="wrap">
            <Button onClick={() => fileInputRef.current?.click()} loading={previewMutation.isPending}>
              Cargar archivo
            </Button>
            <Button variant="default" onClick={() => void handleDownloadTemplate()} loading={templateLoading}>
              Descargar plantilla
            </Button>
            <Button
              variant="default"
              onClick={() => {
                if (pendingFile && preview) {
                  downloadImportRejectedRows(pendingFile.name, preview);
                }
              }}
              disabled={!preview || preview.summary.invalidRows === 0}
            >
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
          {pendingFile ? (
            <Text size="sm">
              Archivo seleccionado: <strong>{pendingFile.name}</strong>
            </Text>
          ) : null}
          {clientError ? <Alert color="red">{clientError}</Alert> : null}
        </Stack>
      </SectionCard>

      {previewMutation.isPending ? <LoadingState message="Validando archivo..." /> : null}

      {executeResult ? (
        <SectionCard title="Resultado" description="Resumen de la ejecución.">
          <Stack gap="sm">
            <Group gap="xs" wrap="wrap">
              <Badge>Total: {executeResult.summary.totalRows}</Badge>
              <Badge color="green" variant="light">
                Creadas: {executeResult.summary.created}
              </Badge>
              <Badge color="blue" variant="light">
                Actualizadas: {executeResult.summary.updated}
              </Badge>
              <Badge color={executeResult.summary.rejected > 0 ? "red" : "gray"} variant="light">
                Rechazadas: {executeResult.summary.rejected}
              </Badge>
            </Group>
            <Button
              variant="default"
              onClick={() => {
                if (pendingFile) {
                  downloadImportRejectedRows(pendingFile.name, executeResult);
                }
              }}
              disabled={executeResult.summary.rejected === 0}
            >
              Descargar filas rechazadas
            </Button>
          </Stack>
        </SectionCard>
      ) : null}

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
              <SectionCard title="Vista previa" description="Paso 2 · Revisá filas válidas e inválidas.">
                <Stack gap="md">
                  <Group gap="xs" wrap="wrap">
                    {preview.format ? <Badge variant="light">Formato: {preview.format}</Badge> : null}
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

                  <SegmentedControl
                    value={rowFilter}
                    onChange={(value) => setRowFilter(value as RowFilter)}
                    data={[
                      { value: "all", label: "Todas" },
                      { value: "valid", label: "Válidas" },
                      { value: "invalid", label: "Inválidas" },
                    ]}
                  />

                  <DataTable
                    rows={filteredRows}
                    columns={previewColumns}
                    getRowKey={(row) => String(row.rowNumber)}
                    aria-label="Vista previa de importación"
                  />
                </Stack>
              </SectionCard>

              <SectionCard title="Confirmación" description="Paso 3 · Ejecutá la importación.">
                <Stack gap="sm">
                  <Button
                    onClick={() => void handleConfirm()}
                    disabled={!preview.summary.canConfirm || executeMutation.isPending || Boolean(executeResult)}
                    loading={executeMutation.isPending}
                  >
                    Confirmar importación
                  </Button>
                  {!preview.summary.canConfirm ? (
                    <Text size="sm" c="dimmed">
                      {strategy.entityType === "operations"
                        ? "Corregí todas las filas inválidas antes de confirmar."
                        : "No hay filas válidas para importar."}
                    </Text>
                  ) : null}
                </Stack>
              </SectionCard>
            </>
          ) : preview.fileErrors.length === 0 ? (
            <ErrorState message="No se encontraron filas para importar." />
          ) : null}
        </>
      ) : !previewMutation.isPending ? (
        <EmptyState
          title="Sin vista previa"
          description="Cargá un archivo CSV o XLSX para validar y revisar las filas antes de importar."
        />
      ) : null}
    </Stack>
  );
}
