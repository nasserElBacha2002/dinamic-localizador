import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useRef, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { ErrorState } from "../../components/common/ErrorState";
import { FeedbackSnackbar } from "../../components/common/FeedbackSnackbar";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusChip } from "../../components/common/StatusChip";
import { useInventoryImportConfirm, useInventoryImportPreview } from "../../hooks/useInventoryImport";
import { AdminLayout } from "../../layouts/AdminLayout";
import type {
  InventoryImportConfirmRow,
  InventoryImportPreviewResult,
  InventoryImportPreviewRow,
} from "../../types/inventory-import";
import { formatDateTime } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import {
  INVENTORY_IMPORT_FORMAT_HELP,
  downloadInventoryImportErrors,
  downloadRecommendedImportTemplate,
  isAcceptedImportFile,
  readFileAsBase64,
  UNSUPPORTED_IMPORT_FILE_MESSAGE,
} from "../../utils/inventory-import-template";

function toConfirmRows(rows: InventoryImportPreviewRow[]): InventoryImportConfirmRow[] {
  return rows
    .filter((row) => row.status === "valid")
    .map((row) => ({
      storeId: row.storeId!,
      scheduledStart: row.scheduledStart!,
      scheduledEnd: row.scheduledEnd!,
      earlyToleranceMinutes: row.earlyToleranceMinutes!,
      lateToleranceMinutes: row.lateToleranceMinutes!,
      notes: row.notas.trim() ? row.notas.trim() : null,
    }));
}

function formatScheduledValue(row: InventoryImportPreviewRow, kind: "start" | "end"): string {
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

export function InventoryImportPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewMutation = useInventoryImportPreview();
  const confirmMutation = useInventoryImportConfirm();

  const [preview, setPreview] = useState<InventoryImportPreviewResult | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });

  const handleFileSelect = async (file: File | null) => {
    setClientError(null);
    setPreview(null);

    if (!file) {
      return;
    }

    if (!isAcceptedImportFile(file)) {
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
      setFeedback({
        open: true,
        message: "Inventarios importados correctamente",
        severity: "success",
      });
      navigate("/inventories");
    } catch (error) {
      setFeedback({
        open: true,
        message: getApiErrorMessage(error, "No se pudo completar la importación."),
        severity: "error",
      });
    }
  };

  const isClientFormat = preview?.format === "client";
  const hasImportErrors = (preview?.summary.invalidRows ?? 0) > 0;

  const handleDownloadErrors = () => {
    if (!preview || !selectedFileName || !hasImportErrors) {
      return;
    }

    downloadInventoryImportErrors(selectedFileName, preview);
  };

  return (
    <AdminLayout>
      <PageHeader
        title="Importar inventarios"
        description="Cargá un CSV o XLSX, revisá la vista previa y confirmá la importación."
        action={
          <Button component={RouterLink} to="/inventories" variant="outlined">
            Volver al listado
          </Button>
        }
      />

      <Stack spacing={3}>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              {INVENTORY_IMPORT_FORMAT_HELP}
            </Typography>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} flexWrap="wrap" useFlexGap>
              <Button variant="contained" onClick={() => fileInputRef.current?.click()}>
                Cargar archivo
              </Button>
              <Button variant="outlined" onClick={downloadRecommendedImportTemplate}>
                Descargar plantilla
              </Button>
              <Button
                variant="outlined"
                onClick={handleDownloadErrors}
                disabled={!preview || !hasImportErrors}
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
            </Stack>

            {selectedFileName ? (
              <Typography variant="body2">Archivo seleccionado: {selectedFileName}</Typography>
            ) : null}
            {clientError ? <Alert severity="error">{clientError}</Alert> : null}
          </Stack>
        </Paper>

        {previewMutation.isPending ? <LoadingState message="Validando archivo..." /> : null}

        {preview ? (
          <>
            {preview.fileErrors.length > 0 ? (
              <Alert severity="error">
                <Stack spacing={0.5}>
                  {preview.fileErrors.map((error) => (
                    <Typography key={error} variant="body2">
                      {error}
                    </Typography>
                  ))}
                </Stack>
              </Alert>
            ) : null}

            {preview.rows.length > 0 ? (
              <>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {preview.format ? (
                    <Chip
                      label={`Formato: ${preview.format === "client" ? "PUNTO / Fecha" : "Extendido"}`}
                      variant="outlined"
                    />
                  ) : null}
                  {preview.fileType ? <Chip label={`Archivo: ${preview.fileType.toUpperCase()}`} variant="outlined" /> : null}
                  <Chip label={`Total: ${preview.summary.totalRows}`} />
                  <Chip label={`Válidas: ${preview.summary.validRows}`} color="success" variant="outlined" />
                  <Chip
                    label={`Inválidas: ${preview.summary.invalidRows}`}
                    color={preview.summary.invalidRows > 0 ? "error" : "default"}
                    variant="outlined"
                  />
                </Stack>

                <TableContainer component={Paper} variant="outlined">
                  <Table size="small" aria-label="Vista previa de importación de inventarios">
                    <TableHead>
                      <TableRow>
                        <TableCell>Fila</TableCell>
                        {isClientFormat ? <TableCell>PUNTO</TableCell> : <TableCell>Tienda</TableCell>}
                        <TableCell>Tienda resuelta</TableCell>
                        <TableCell>{isClientFormat ? "Fecha original" : "Inicio original"}</TableCell>
                        {isClientFormat ? <TableCell>Fecha inventario</TableCell> : null}
                        <TableCell>Inicio calculado</TableCell>
                        <TableCell>Fin calculado</TableCell>
                        <TableCell>Temprana</TableCell>
                        <TableCell>Tardía</TableCell>
                        {!isClientFormat ? <TableCell>Notas</TableCell> : null}
                        <TableCell>Estado</TableCell>
                        <TableCell>Errores</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {preview.rows.map((row) => (
                        <TableRow key={row.rowNumber} hover>
                          <TableCell>{row.rowNumber}</TableCell>
                          <TableCell>{isClientFormat ? row.punto || "—" : row.tienda || "—"}</TableCell>
                          <TableCell>{row.storeName ?? "—"}</TableCell>
                          <TableCell>{row.rawFecha || "—"}</TableCell>
                          {isClientFormat ? (
                            <TableCell>{row.parsedInventoryDate ?? "—"}</TableCell>
                          ) : null}
                          <TableCell>
                            {formatScheduledValue(row, "start")}
                            {row.scheduledStartDisplay ? (
                              <Typography variant="caption" color="text.secondary" display="block">
                                {row.scheduledStartDisplay}
                              </Typography>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            {formatScheduledValue(row, "end")}
                            {row.scheduledEndDisplay ? (
                              <Typography variant="caption" color="text.secondary" display="block">
                                {row.scheduledEndDisplay}
                              </Typography>
                            ) : null}
                          </TableCell>
                          <TableCell>{row.earlyToleranceDisplay}</TableCell>
                          <TableCell>{row.lateToleranceDisplay}</TableCell>
                          {!isClientFormat ? <TableCell>{row.notas || "—"}</TableCell> : null}
                          <TableCell>
                            <StatusChip
                              label={row.status === "valid" ? "Válida" : "Inválida"}
                              color={row.status === "valid" ? "success" : "error"}
                            />
                          </TableCell>
                          <TableCell sx={{ maxWidth: 280 }}>
                            {row.errors.length > 0 ? row.errors.join(" · ") : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                <Box>
                  <Button
                    variant="contained"
                    onClick={handleConfirm}
                    disabled={!preview.summary.canConfirm || confirmMutation.isPending}
                  >
                    Confirmar importación
                  </Button>
                  {!preview.summary.canConfirm ? (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Corregí todas las filas inválidas antes de confirmar la importación.
                    </Typography>
                  ) : null}
                </Box>
              </>
            ) : preview.fileErrors.length === 0 ? (
              <ErrorState message="No se encontraron filas para importar." />
            ) : null}
          </>
        ) : null}
      </Stack>

      <FeedbackSnackbar
        open={feedback.open}
        message={feedback.message}
        severity={feedback.severity}
        onClose={() => setFeedback((current) => ({ ...current, open: false }))}
      />
    </AdminLayout>
  );
}
