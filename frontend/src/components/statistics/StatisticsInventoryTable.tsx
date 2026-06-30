import {
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
} from "@mui/material";
import { useMemo } from "react";
import { EmptyState } from "../common/EmptyState";
import { ErrorState } from "../common/ErrorState";
import { LoadingState } from "../common/LoadingState";
import { PaginationControls } from "../common/PaginationControls";
import { StatusChip } from "../common/StatusChip";
import { ExportActionButtons } from "./ExportActionButtons";
import type { AttendanceByInventoryRow } from "../../types/statistics";
import { formatDateTime } from "../../utils/dates";
import { formatPercent } from "../../utils/export";
import { getApiErrorMessage } from "../../utils/errors";
import { inventoryStatusLabels } from "../../utils/labels";

type SortableField =
  | "storeName"
  | "scheduledStart"
  | "assignedEmployeesCount"
  | "presentCount"
  | "noShowCount"
  | "lateCount"
  | "outsideGeofenceCount"
  | "pendingReviewCount"
  | "attendancePercentage"
  | "operationalStatus";

interface StatisticsInventoryTableProps {
  rows: AttendanceByInventoryRow[];
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  page: number;
  pageSize: number;
  total: number;
  sortBy: SortableField;
  sortDirection: "asc" | "desc";
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSortChange: (field: SortableField) => void;
  exportRows: AttendanceByInventoryRow[];
  dateFrom?: string;
  dateTo?: string;
  exportsDisabled?: boolean;
}

const HEADERS = [
  "Inventario",
  "Tienda",
  "Dirección",
  "Programado",
  "Asignados",
  "Presentes",
  "Sin asistencia",
  "Tarde",
  "Fuera geocerca",
  "Pendiente",
  "% asistencia",
  "Estado",
];

function toExportRows(rows: AttendanceByInventoryRow[]) {
  return rows.map((row) => [
    row.inventoryId,
    row.storeName,
    row.storeAddress ?? "",
    formatDateTime(row.scheduledStart),
    row.assignedEmployeesCount,
    row.presentCount,
    row.noShowCount,
    row.lateCount,
    row.outsideGeofenceCount,
    row.pendingReviewCount,
    formatPercent(row.attendancePercentage),
    inventoryStatusLabels[row.operationalStatus as keyof typeof inventoryStatusLabels] ?? row.operationalStatus,
  ]);
}

export function StatisticsInventoryTable({
  rows,
  isLoading,
  isError,
  error,
  page,
  pageSize,
  total,
  sortBy,
  sortDirection,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  exportRows,
  dateFrom,
  dateTo,
  exportsDisabled = false,
}: StatisticsInventoryTableProps) {
  const exportData = useMemo(() => toExportRows(exportRows), [exportRows]);

  if (isLoading) {
    return <LoadingState message="Cargando estadísticas por inventario..." />;
  }

  if (isError) {
    return <ErrorState message={getApiErrorMessage(error)} />;
  }

  const createSortHandler = (field: SortableField) => () => onSortChange(field);

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <ExportActionButtons
          baseName="attendance-by-inventory"
          headers={HEADERS}
          rows={exportData}
          dateFrom={dateFrom}
          dateTo={dateTo}
          sheetName="Por inventario"
          disabled={exportsDisabled}
        />
      </Stack>

      {rows.length === 0 ? (
        <EmptyState title="Sin resultados" description="No hay datos de inventarios para los filtros seleccionados." />
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Inventario</TableCell>
                <TableCell sortDirection={sortBy === "storeName" ? sortDirection : false}>
                  <TableSortLabel
                    active={sortBy === "storeName"}
                    direction={sortBy === "storeName" ? sortDirection : "asc"}
                    onClick={createSortHandler("storeName")}
                  >
                    Tienda
                  </TableSortLabel>
                </TableCell>
                <TableCell>Dirección</TableCell>
                <TableCell>Programado</TableCell>
                <TableCell align="right">Asignados</TableCell>
                <TableCell align="right">Presentes</TableCell>
                <TableCell align="right">Sin asistencia</TableCell>
                <TableCell align="right">Tarde</TableCell>
                <TableCell align="right">Fuera geocerca</TableCell>
                <TableCell align="right">Pendiente</TableCell>
                <TableCell align="right">% asistencia</TableCell>
                <TableCell>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.inventoryId} hover>
                  <TableCell sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                    {row.inventoryId.slice(0, 8)}…
                  </TableCell>
                  <TableCell>{row.storeName}</TableCell>
                  <TableCell>{row.storeAddress ?? "—"}</TableCell>
                  <TableCell>{formatDateTime(row.scheduledStart)}</TableCell>
                  <TableCell align="right">{row.assignedEmployeesCount}</TableCell>
                  <TableCell align="right">{row.presentCount}</TableCell>
                  <TableCell align="right">{row.noShowCount}</TableCell>
                  <TableCell align="right">{row.lateCount}</TableCell>
                  <TableCell align="right">{row.outsideGeofenceCount}</TableCell>
                  <TableCell align="right">{row.pendingReviewCount}</TableCell>
                  <TableCell align="right">{formatPercent(row.attendancePercentage)}</TableCell>
                  <TableCell>
                    <StatusChip
                      label={
                        inventoryStatusLabels[row.operationalStatus as keyof typeof inventoryStatusLabels] ??
                        row.operationalStatus
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <PaginationControls
        meta={{
          page,
          limit: pageSize,
          total,
          totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
        }}
        onPageChange={onPageChange}
        pageSize={pageSize}
        onPageSizeChange={onPageSizeChange}
        showPageSizeSelector
      />
    </Stack>
  );
}
