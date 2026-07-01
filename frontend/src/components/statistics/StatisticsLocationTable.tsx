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
import type { AttendanceByLocationRow } from "../../types/statistics";
import { formatPercent } from "../../utils/export";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";

type SortableField =
  | "storeName"
  | "address"
  | "totalInventories"
  | "averageAttendancePercentage"
  | "totalAssignedEmployees"
  | "totalConfirmedAttendances"
  | "totalNoShows"
  | "totalLateRecords"
  | "totalOutsideGeofenceRecords"
  | "totalManualReviews";

interface StatisticsLocationTableProps {
  rows: AttendanceByLocationRow[];
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
  exportRows: AttendanceByLocationRow[];
  dateFrom?: string;
  dateTo?: string;
  exportsDisabled?: boolean;
}

const EXPORT_HEADERS = [
  "Tienda",
  "Dirección",
  "Inventarios",
  "% asistencia promedio",
  "Empleados asignados",
  "Confirmadas",
  "Sin asistencia",
  "Tarde",
  "Fuera geocerca",
  "Revisiones manuales",
];

function toExportRows(rows: AttendanceByLocationRow[]) {
  return rows.map((row) => [
    row.storeName,
    row.address ?? "",
    row.totalInventories,
    formatPercent(row.averageAttendancePercentage),
    row.totalAssignedEmployees,
    row.totalConfirmedAttendances,
    row.totalNoShows,
    row.totalLateRecords,
    row.totalOutsideGeofenceRecords,
    row.totalManualReviews,
  ]);
}

export function StatisticsLocationTable({
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
}: StatisticsLocationTableProps) {
  const exportData = useMemo(() => toExportRows(exportRows), [exportRows]);

  if (isLoading) {
    return <LoadingState message={`Cargando estadísticas por ${terminology.location.singular.toLowerCase()}...`} />;
  }

  if (isError) {
    return <ErrorState message={getApiErrorMessage(error)} />;
  }

  const createSortHandler = (field: SortableField) => () => onSortChange(field);

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <ExportActionButtons
          baseName="attendance-by-location"
          headers={EXPORT_HEADERS}
          rows={exportData}
          dateFrom={dateFrom}
          dateTo={dateTo}
          sheetName="Por tienda"
          disabled={exportsDisabled}
        />
      </Stack>

      {rows.length === 0 ? (
        <EmptyState
          title="Sin resultados"
          description={`No hay datos de ${terminology.location.plural.toLowerCase()} para los filtros seleccionados.`}
        />
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sortDirection={sortBy === "storeName" ? sortDirection : false}>
                  <TableSortLabel
                    active={sortBy === "storeName"}
                    direction={sortBy === "storeName" ? sortDirection : "asc"}
                    onClick={createSortHandler("storeName")}
                  >
                    {terminology.location.singular}
                  </TableSortLabel>
                </TableCell>
                <TableCell>Dirección</TableCell>
                <TableCell align="right">{terminology.operation.plural}</TableCell>
                <TableCell align="right">% promedio</TableCell>
                <TableCell align="right">Asignados</TableCell>
                <TableCell align="right">Confirmadas</TableCell>
                <TableCell align="right">Sin asistencia</TableCell>
                <TableCell align="right">Tarde</TableCell>
                <TableCell align="right">Fuera geocerca</TableCell>
                <TableCell align="right">Revisiones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.storeId} hover>
                  <TableCell>{row.storeName}</TableCell>
                  <TableCell>{row.address ?? "—"}</TableCell>
                  <TableCell align="right">{row.totalInventories}</TableCell>
                  <TableCell align="right">{formatPercent(row.averageAttendancePercentage)}</TableCell>
                  <TableCell align="right">{row.totalAssignedEmployees}</TableCell>
                  <TableCell align="right">{row.totalConfirmedAttendances}</TableCell>
                  <TableCell align="right">{row.totalNoShows}</TableCell>
                  <TableCell align="right">{row.totalLateRecords}</TableCell>
                  <TableCell align="right">{row.totalOutsideGeofenceRecords}</TableCell>
                  <TableCell align="right">{row.totalManualReviews}</TableCell>
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
