import { Alert, Stack } from "@mantine/core";
import { DataTable, LoadingState, ResponsiveModal, type DataTableColumn } from "../../design-system";
import { useEmployeeAbsenceBalanceMovements } from "../../hooks/useAbsences";
import type { AbsenceBalanceMovement, EmployeeAbsenceBalanceSummary } from "../../types/absence";
import { getApiErrorMessage } from "../../utils/errors";
import { safeText } from "../../utils/display-safe";

const MOVEMENT_LABELS: Record<string, string> = {
  INITIAL_GRANT: "Otorgamiento inicial",
  MANUAL_CREDIT: "Ajuste (+)",
  MANUAL_DEBIT: "Ajuste (−)",
  RESERVE: "Reserva",
  RELEASE: "Liberación",
  CONSUME: "Consumo",
  REVERSAL: "Reversión",
  MIGRATION_ADJUSTMENT: "Migración",
};

interface AbsenceBalanceMovementHistoryProps {
  opened: boolean;
  employeeId: string;
  year: number;
  target: EmployeeAbsenceBalanceSummary | null;
  onClose: () => void;
}

export function AbsenceBalanceMovementHistory({
  opened,
  employeeId,
  year,
  target,
  onClose,
}: AbsenceBalanceMovementHistoryProps) {
  const movementsQuery = useEmployeeAbsenceBalanceMovements(
    employeeId,
    target?.absenceType.id,
    { year, page: 1, limit: 20 },
    Boolean(opened && target),
  );

  const columns: DataTableColumn<AbsenceBalanceMovement>[] = [
    {
      key: "date",
      header: "Fecha",
      getValue: (row) => new Date(row.createdAt).toLocaleString("es-AR"),
    },
    {
      key: "movement",
      header: "Movimiento",
      getValue: (row) => MOVEMENT_LABELS[row.movementType] ?? row.movementType,
    },
    {
      key: "quantity",
      header: "Cantidad",
      getValue: (row) => `${row.direction === "DEBIT" ? "−" : "+"}${row.quantity}`,
      align: "right",
    },
    {
      key: "request",
      header: "Solicitud",
      getValue: (row) => row.absenceRequestId?.slice(0, 8) ?? "—",
    },
    {
      key: "reason",
      header: "Motivo",
      getValue: (row) => safeText(row.reason),
    },
    {
      key: "actor",
      header: "Actor",
      getValue: (row) =>
        row.performedByUserId?.slice(0, 8) ?? row.performedByEmployeeId?.slice(0, 8) ?? "—",
    },
  ];

  return (
    <ResponsiveModal
      opened={opened}
      onClose={onClose}
      title={`Historial · ${target?.absenceType.name ?? ""} · ${year}`}
      bodyMode="normal"
      size="xl"
    >
      <Stack gap="md">
        {movementsQuery.isLoading ? <LoadingState /> : null}
        {movementsQuery.isError ? (
          <Alert color="red">
            {getApiErrorMessage(movementsQuery.error, "No se pudo cargar el historial.")}
          </Alert>
        ) : null}
        {!movementsQuery.isLoading && !movementsQuery.isError ? (
          <DataTable
            rows={movementsQuery.data?.data ?? []}
            columns={columns}
            getRowKey={(row) => row.id}
            emptyTitle="No hay movimientos para este saldo."
            aria-label="Historial de movimientos de saldo"
          />
        ) : null}
      </Stack>
    </ResponsiveModal>
  );
}
