import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import { LoadingState } from "../common/LoadingState";
import {
  useEmployeeAbsenceBalances,
  useUpsertEmployeeAbsenceBalance,
} from "../../hooks/useAbsences";
import type { AbsenceBalanceImpact, EmployeeAbsenceBalanceSummary } from "../../types/absence";

interface EmployeeAbsenceBalanceCardProps {
  employeeId: string;
  year: number;
  balanceImpact?: AbsenceBalanceImpact | null;
  showEdit?: boolean;
  onBalanceSaved?: () => void;
}

export function EmployeeAbsenceBalanceCard({
  employeeId,
  year,
  balanceImpact,
  showEdit = true,
  onBalanceSaved,
}: EmployeeAbsenceBalanceCardProps) {
  const balancesQuery = useEmployeeAbsenceBalances(employeeId, year);
  const upsertMutation = useUpsertEmployeeAbsenceBalance(employeeId);
  const [editTarget, setEditTarget] = useState<EmployeeAbsenceBalanceSummary | null>(null);
  const [totalDays, setTotalDays] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const visibleBalances = useMemo(() => {
    const rows = balancesQuery.data ?? [];
    return rows.filter(
      (row) =>
        row.absenceType.deductsBalance ||
        row.assignedDays > 0 ||
        row.approvedDays > 0 ||
        row.pendingDays > 0,
    );
  }, [balancesQuery.data]);

  const openEdit = (row: EmployeeAbsenceBalanceSummary) => {
    setEditTarget(row);
    setTotalDays(String(row.assignedDays));
    setNotes("");
    setError(null);
  };

  const handleSave = async () => {
    if (!editTarget) {
      return;
    }

    const parsedTotalDays = Number(totalDays);
    if (!Number.isFinite(parsedTotalDays) || parsedTotalDays < 0) {
      setError("Los días asignados deben ser un número mayor o igual a 0.");
      return;
    }

    try {
      await upsertMutation.mutateAsync({
        absenceTypeId: editTarget.absenceType.id,
        year,
        totalDays: parsedTotalDays,
        notes: notes.trim() ? notes.trim() : null,
      });
      setEditTarget(null);
      onBalanceSaved?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el saldo.");
    }
  };

  if (balancesQuery.isLoading) {
    return <LoadingState />;
  }

  return (
    <Stack spacing={2}>
      {balanceImpact ? (
        balanceImpact.deductsBalance ? (
          <Stack spacing={1}>
            {balanceImpact.hasSufficientBalance === false ? (
              <Alert severity="error">
                El empleado no tiene saldo suficiente para aprobar esta solicitud.
              </Alert>
            ) : null}
            <Typography variant="body2" color="text.secondary">
              Año {balanceImpact.year}
            </Typography>
            <DetailBalanceGrid
              assignedDays={balanceImpact.assignedDays}
              approvedDays={balanceImpact.approvedDays}
              pendingDays={balanceImpact.pendingDays}
              availableDays={balanceImpact.availableDays}
              requestDays={balanceImpact.requestDays}
              availableAfterApproval={balanceImpact.availableAfterApproval}
            />
          </Stack>
        ) : (
          <Alert severity="info">{balanceImpact.message ?? "Este tipo de ausencia no descuenta saldo."}</Alert>
        )
      ) : null}

      {visibleBalances.length > 0 ? (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Tipo</TableCell>
              <TableCell align="right">Asignados</TableCell>
              <TableCell align="right">Aprobados</TableCell>
              <TableCell align="right">Pendientes</TableCell>
              <TableCell align="right">Disponibles</TableCell>
              {showEdit ? <TableCell align="right">Acción</TableCell> : null}
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleBalances.map((row) => (
              <TableRow key={row.absenceType.id}>
                <TableCell>{row.absenceType.name}</TableCell>
                <TableCell align="right">{row.assignedDays}</TableCell>
                <TableCell align="right">{row.approvedDays}</TableCell>
                <TableCell align="right">{row.pendingDays}</TableCell>
                <TableCell align="right">{row.availableDays}</TableCell>
                {showEdit ? (
                  <TableCell align="right">
                    <Button size="small" onClick={() => openEdit(row)}>
                      Editar saldo
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Typography color="text.secondary">
          No hay saldos cargados para este empleado en {year}.
        </Typography>
      )}

      <Dialog open={Boolean(editTarget)} onClose={() => setEditTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          Editar saldo · {editTarget?.absenceType.name} · {year}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Días asignados"
              type="number"
              inputProps={{ min: 0, step: 0.5 }}
              value={totalDays}
              onChange={(event) => setTotalDays(event.target.value)}
              fullWidth
            />
            <TextField
              label="Notas"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
            {error ? <Alert severity="error">{error}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTarget(null)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={upsertMutation.isPending}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function DetailBalanceGrid(input: {
  assignedDays?: number;
  approvedDays?: number;
  pendingDays?: number;
  availableDays?: number;
  requestDays?: number;
  availableAfterApproval?: number;
}) {
  const fields = [
    { label: "Días asignados", value: input.assignedDays },
    { label: "Días aprobados", value: input.approvedDays },
    { label: "Días pendientes", value: input.pendingDays },
    { label: "Saldo disponible", value: input.availableDays },
    { label: "Días solicitados", value: input.requestDays },
    { label: "Saldo luego de aprobar", value: input.availableAfterApproval },
  ];

  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} flexWrap="wrap" useFlexGap>
      {fields.map((field) => (
        <Typography key={field.label} variant="body2">
          <strong>{field.label}:</strong> {field.value ?? "—"}
        </Typography>
      ))}
    </Stack>
  );
}
