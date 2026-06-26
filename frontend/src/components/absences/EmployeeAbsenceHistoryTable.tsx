import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { LoadingState } from "../common/LoadingState";
import { StatusChip } from "../common/StatusChip";
import { useAbsenceRequests } from "../../hooks/useAbsences";
import { absenceStatusLabels, formatAbsenceDate } from "../../utils/absence-labels";

interface EmployeeAbsenceHistoryTableProps {
  employeeId: string;
  year: number;
}

export function EmployeeAbsenceHistoryTable({ employeeId, year }: EmployeeAbsenceHistoryTableProps) {
  const historyQuery = useAbsenceRequests({
    employeeId,
    dateFrom: `${year}-01-01`,
    dateTo: `${year}-12-31`,
    page: 1,
    limit: 10,
  });

  if (historyQuery.isLoading) {
    return <LoadingState />;
  }

  const rows = historyQuery.data?.data ?? [];

  if (rows.length === 0) {
    return (
      <Typography color="text.secondary">
        No hay solicitudes de ausencia registradas para {year}.
      </Typography>
    );
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Tipo</TableCell>
            <TableCell>Período</TableCell>
            <TableCell align="right">Días</TableCell>
            <TableCell>Estado</TableCell>
            <TableCell align="right">Detalle</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.absenceType.name}</TableCell>
              <TableCell>
                {formatAbsenceDate(row.startDate)} - {formatAbsenceDate(row.endDate)}
              </TableCell>
              <TableCell align="right">{row.totalDays}</TableCell>
              <TableCell>
                <StatusChip label={absenceStatusLabels[row.status]} />
              </TableCell>
              <TableCell align="right">
                <RouterLink to={`/absences/${row.id}`}>Ver</RouterLink>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
