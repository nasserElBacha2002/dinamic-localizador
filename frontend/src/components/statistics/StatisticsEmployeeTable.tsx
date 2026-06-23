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
import { ExportActionButtons } from "./ExportActionButtons";
import type { AttendanceByEmployeeRow } from "../../types/statistics";
import { formatDateTime } from "../../utils/dates";
import { formatPercent } from "../../utils/export";
import { getApiErrorMessage } from "../../utils/errors";

type SortableField =
  | "employeeName"
  | "phoneNumber"
  | "assignedInventoriesCount"
  | "confirmedAttendances"
  | "noShowCount"
  | "lateCount"
  | "outsideGeofenceCount"
  | "pendingReviewCount"
  | "attendancePercentage"
  | "lastAttendanceDate";

interface StatisticsEmployeeTableProps {
  rows: AttendanceByEmployeeRow[];
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
  exportRows: AttendanceByEmployeeRow[];
  dateFrom?: string;
  dateTo?: string;
}

const HEADERS = [
  "Empleado",
  "Teléfono",
  "Inventarios asignados",
  "Confirmadas",
  "Sin asistencia",
  "Tarde",
  "Fuera de geocerca",
  "Pendiente",
  "% asistencia",
  "Última asistencia",
];

function toExportRows(rows: AttendanceByEmployeeRow[]) {
  return rows.map((row) => [
    row.employeeName,
    row.phoneNumber,
    row.assignedInventoriesCount,
    row.confirmedAttendances,
    row.noShowCount,
    row.lateCount,
    row.outsideGeofenceCount,
    row.pendingReviewCount,
    formatPercent(row.attendancePercentage),
    row.lastAttendanceDate ? formatDateTime(row.lastAttendanceDate) : "—",
  ]);
}

export function StatisticsEmployeeTable({
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
}: StatisticsEmployeeTableProps) {
  const exportData = useMemo(() => toExportRows(exportRows), [exportRows]);

  if (isLoading) {
    return <LoadingState message="Cargando estadísticas por empleado..." />;
  }

  if (isError) {
    return <ErrorState message={getApiErrorMessage(error)} />;
  }

  const createSortHandler = (field: SortableField) => () => onSortChange(field);

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <ExportActionButtons
          baseName="attendance-by-employee"
          headers={HEADERS}
          rows={exportData}
          dateFrom={dateFrom}
          dateTo={dateTo}
          sheetName="Por empleado"
        />
      </Stack>

      {rows.length === 0 ? (
        <EmptyState title="Sin resultados" description="No hay datos de empleados para los filtros seleccionados." />
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sortDirection={sortBy === "employeeName" ? sortDirection : false}>
                  <TableSortLabel
                    active={sortBy === "employeeName"}
                    direction={sortBy === "employeeName" ? sortDirection : "asc"}
                    onClick={createSortHandler("employeeName")}
                  >
                    Empleado
                  </TableSortLabel>
                </TableCell>
                <TableCell>Teléfono</TableCell>
                <TableCell align="right">Inventarios</TableCell>
                <TableCell align="right">Confirmadas</TableCell>
                <TableCell align="right">Sin asistencia</TableCell>
                <TableCell align="right">Tarde</TableCell>
                <TableCell align="right">Fuera geocerca</TableCell>
                <TableCell align="right">Pendiente</TableCell>
                <TableCell align="right">% asistencia</TableCell>
                <TableCell>Última asistencia</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.employeeId} hover>
                  <TableCell>{row.employeeName}</TableCell>
                  <TableCell>{row.phoneNumber}</TableCell>
                  <TableCell align="right">{row.assignedInventoriesCount}</TableCell>
                  <TableCell align="right">{row.confirmedAttendances}</TableCell>
                  <TableCell align="right">{row.noShowCount}</TableCell>
                  <TableCell align="right">{row.lateCount}</TableCell>
                  <TableCell align="right">{row.outsideGeofenceCount}</TableCell>
                  <TableCell align="right">{row.pendingReviewCount}</TableCell>
                  <TableCell align="right">{formatPercent(row.attendancePercentage)}</TableCell>
                  <TableCell>{row.lastAttendanceDate ? formatDateTime(row.lastAttendanceDate) : "—"}</TableCell>
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
