import {
  Alert,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Button as MantineButton, Group, Modal, NumberInput, Stack as MantineStack, Textarea } from "@mantine/core";
import { useMemo, useState } from "react";
import { FeedbackSnackbar } from "../common/FeedbackSnackbar";
import { LoadingState } from "../common/LoadingState";
import {
  useEmployeeAbsenceBalances,
  useUpsertEmployeeAbsenceBalance,
} from "../../hooks/useAbsences";
import type { AbsenceBalanceImpact, EmployeeAbsenceBalanceSummary } from "../../types/absence";
import { getApiErrorMessage } from "../../utils/errors";

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
  const [successOpen, setSuccessOpen] = useState(false);

  const visibleBalances = useMemo(() => {
    const rows = balancesQuery.data ?? [];
    if (showEdit) {
      return rows;
    }

    return rows.filter(
      (row) =>
        row.absenceType.deductsBalance ||
        row.assignedDays > 0 ||
        row.approvedDays > 0 ||
        row.pendingDays > 0,
    );
  }, [balancesQuery.data, showEdit]);

  const hasNegativeBalance = visibleBalances.some(
    (row) => row.availableDays < 0 || row.projectedAvailableDays < 0,
  );

  const openEdit = (row: EmployeeAbsenceBalanceSummary) => {
    setEditTarget(row);
    setTotalDays(String(row.assignedDays));
    setNotes(row.notes ?? "");
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
      setSuccessOpen(true);
      onBalanceSaved?.();
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, "No se pudo guardar el saldo."));
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
              <>
                <Alert severity="error">
                  El empleado no tiene saldo suficiente para aprobar esta solicitud.
                </Alert>
                {showEdit ? (
                  <Alert severity="info">
                    Para aprobar esta solicitud, primero cargá o ajustá el saldo del empleado.
                  </Alert>
                ) : null}
              </>
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

      {hasNegativeBalance ? (
        <Alert severity="warning">
          El empleado tiene saldo negativo para este tipo de ausencia. Revisá los días asignados o las
          solicitudes aprobadas.
        </Alert>
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
          No hay tipos de ausencia activos para mostrar en {year}.
        </Typography>
      )}

      <Modal
        opened={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title={`Editar saldo · ${editTarget?.absenceType.name} · ${year}`}
        centered
      >
        <MantineStack gap="md">
          <NumberInput
            label="Días asignados"
            value={totalDays === "" ? "" : Number(totalDays)}
            onChange={(value) => setTotalDays(value === "" || value === undefined ? "" : String(value))}
            min={0}
            step={0.5}
            decimalScale={1}
          />
          <Textarea
            label="Notas"
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
            minRows={2}
          />
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Group justify="flex-end" gap="sm">
            <MantineButton variant="default" onClick={() => setEditTarget(null)}>
              Cancelar
            </MantineButton>
            <MantineButton onClick={handleSave} loading={upsertMutation.isPending}>
              Guardar
            </MantineButton>
          </Group>
        </MantineStack>
      </Modal>

      <FeedbackSnackbar
        open={successOpen}
        message="Saldo actualizado correctamente."
        severity="success"
        onClose={() => setSuccessOpen(false)}
      />
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
