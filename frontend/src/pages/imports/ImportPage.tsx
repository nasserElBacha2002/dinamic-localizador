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
  resolveImportNotification,
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
  const entityType: ImportEntityType =
    isImportEntityType(requestedEntity) &&
    availableStrategies.some((strategy) => strategy.entityType === requestedEntity)
      ? requestedEntity
      : (availableStrategies[0]?.entityType ?? "operations");

  const strategy = getImportEntityStrategy(entityType);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewMutation = useImportPreview(entityType);
  const executeMutation = useImportExecute(entityType);

  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [executeResult, setExecuteResult] = useState<ImportExecuteResult | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [rowFilter, setRowFilter] = useState<RowFilter>("all");
  const [templateLoading, setTemplateLoading] = useState(false);

  const resetImportState = () => {
    setPreview(null);
    setExecuteResult(null);
    setPendingFileName(null);
    setClientError(null);
    setRowFilter("all");
  };

  const handleEntityChange = (next: string) => {
    if (!isImportEntityType(next) || next === entityType) {
      return;
    }
    setSearchParams({ entity: next });
    resetImportState();
  };

  const activePreview = preview?.entityType === entityType ? preview : null;
  const activeExecuteResult = executeResult?.entityType === entityType ? executeResult : null;

  const handleFileSelect = async (file: File | null) => {
    setClientError(null);
    setPreview(null);
    setExecuteResult(null);

    if (!file) {
      setPendingFileName(null);
      return;
    }

    if (!isAcceptedImportFile(file)) {
      setPendingFileName(null);
      setClientError(UNSUPPORTED_IMPORT_FILE_MESSAGE);
      return;
    }

    try {
      const fileContentBase64 = await readFileAsBase64(file);
      setPendingFileName(file.name);
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
    if (
      !activePreview?.summary.canConfirm ||
      !activePreview.importJobId ||
      !activePreview.confirmationToken
    ) {
      return;
    }

    try {
      const result = await executeMutation.mutateAsync({
        importJobId: activePreview.importJobId,
        confirmationToken: activePreview.confirmationToken,
      });
      setExecuteResult(result);
      const notification = resolveImportNotification(result);
      notifications.show({
        color: notification.color,
        title: notification.title,
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
    if (!activePreview) {
      return [];
    }
    if (rowFilter === "valid") {
      return activePreview.rows.filter((row) => row.status === "valid");
    }
    if (rowFilter === "invalid") {
      return activePreview.rows.filter((row) => row.status === "invalid" || row.status === "warning");
    }
    return activePreview.rows;
  }, [activePreview, rowFilter]);

  const previewColumns = useMemo(
    () => (activePreview ? buildColumns(activePreview) : []),
    [activePreview],
  );

  const resultTone =
    activeExecuteResult == null
      ? null
      : activeExecuteResult.summary.rejected === 0 && activeExecuteResult.summary.created > 0
        ? "success"
        : activeExecuteResult.summary.created > 0
          ? "warning"
          : "danger";

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
                if (pendingFileName && activePreview) {
                  downloadImportRejectedRows(
                    pendingFileName,
                    activePreview,
                    activePreview.displayColumns,
                  );
                }
              }}
              disabled={!activePreview || activePreview.summary.invalidRows === 0}
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
          {pendingFileName && activePreview ? (
            <Text size="sm">
              Archivo seleccionado: <strong>{pendingFileName}</strong>
            </Text>
          ) : null}
          {clientError ? <Alert color="red">{clientError}</Alert> : null}
        </Stack>
      </SectionCard>

      {previewMutation.isPending ? <LoadingState message="Validando archivo..." /> : null}

      {activeExecuteResult ? (
        <SectionCard title="Resultado" description="Resumen de la ejecución.">
          <Stack gap="sm">
            <Group gap="xs" wrap="wrap">
              {activeExecuteResult.status ? (
                <Badge
                  color={
                    resultTone === "success" ? "green" : resultTone === "warning" ? "yellow" : "red"
                  }
                  variant="light"
                >
                  Estado: {activeExecuteResult.status}
                </Badge>
              ) : null}
              <Badge>Total: {activeExecuteResult.summary.totalRows}</Badge>
              <Badge color="green" variant="light">
                Creadas: {activeExecuteResult.summary.created}
              </Badge>
              <Badge color="blue" variant="light">
                Actualizadas: {activeExecuteResult.summary.updated}
              </Badge>
              <Badge color={activeExecuteResult.summary.rejected > 0 ? "red" : "gray"} variant="light">
                Rechazadas: {activeExecuteResult.summary.rejected}
              </Badge>
            </Group>
            <Button
              variant="default"
              onClick={() => {
                if (pendingFileName) {
                  downloadImportRejectedRows(
                    pendingFileName,
                    activeExecuteResult,
                    activePreview?.displayColumns,
                  );
                }
              }}
              disabled={activeExecuteResult.summary.rejected === 0}
            >
              Descargar filas rechazadas
            </Button>
          </Stack>
        </SectionCard>
      ) : null}

      {activePreview ? (
        <>
          {activePreview.fileErrors.length > 0 ? (
            <Alert color="red" title="Errores de archivo">
              <Stack gap={4}>
                {activePreview.fileErrors.map((error) => (
                  <Text key={error} size="sm">
                    {error}
                  </Text>
                ))}
              </Stack>
            </Alert>
          ) : null}

          {activePreview.rows.length > 0 ? (
            <>
              <SectionCard title="Vista previa" description="Paso 2 · Revisá filas válidas e inválidas.">
                <Stack gap="md">
                  <Group gap="xs" wrap="wrap">
                    {activePreview.format ? (
                      <Badge variant="light">Formato: {activePreview.format}</Badge>
                    ) : null}
                    {activePreview.fileType ? (
                      <Badge variant="light">Archivo: {activePreview.fileType.toUpperCase()}</Badge>
                    ) : null}
                    <Badge>Total: {activePreview.summary.totalRows}</Badge>
                    <Badge color="green" variant="light">
                      Válidas: {activePreview.summary.validRows}
                    </Badge>
                    <Badge
                      color={activePreview.summary.invalidRows > 0 ? "red" : "gray"}
                      variant="light"
                    >
                      Inválidas: {activePreview.summary.invalidRows}
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
                    disabled={
                      !activePreview.summary.canConfirm ||
                      executeMutation.isPending ||
                      Boolean(activeExecuteResult)
                    }
                    loading={executeMutation.isPending}
                  >
                    Confirmar importación
                  </Button>
                  {!activePreview.summary.canConfirm ? (
                    <Text size="sm" c="dimmed">
                      {strategy.entityType === "operations"
                        ? "Corregí todas las filas inválidas antes de confirmar."
                        : "No hay filas válidas para importar."}
                    </Text>
                  ) : null}
                </Stack>
              </SectionCard>
            </>
          ) : activePreview.fileErrors.length === 0 ? (
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
