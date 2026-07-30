import {
  Alert,
  Button,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";
import {
  DataTable,
  LoadingState,
  ResponsiveModal,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
import {
  useAdjustEmployeeAbsenceBalance,
  useEmployeeAbsenceBalanceMovements,
  useEmployeeAbsenceBalances,
} from "../../hooks/useAbsences";
import type {
  AbsenceBalanceAdjustmentOperation,
  AbsenceBalanceMovement,
  EmployeeAbsenceBalanceSummary,
  AbsenceBalanceImpact,
} from "../../types/absence";
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
  const adjustMutation = useAdjustEmployeeAbsenceBalance(employeeId);
  const [editTarget, setEditTarget] = useState<EmployeeAbsenceBalanceSummary | null>(null);
  const [historyTarget, setHistoryTarget] = useState<EmployeeAbsenceBalanceSummary | null>(null);
  const [operation, setOperation] = useState<AbsenceBalanceAdjustmentOperation>("CREDIT");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const movementsQuery = useEmployeeAbsenceBalanceMovements(
    employeeId,
    historyTarget?.absenceType.id,
    { year, page: 1, limit: 20 },
    Boolean(historyTarget),
  );

  const visibleBalances = useMemo(() => {
    const rows = balancesQuery.data ?? [];
    if (showEdit) {
      return rows;
    }

    return rows.filter(
      (row) =>
        row.absenceType?.deductsBalance ||
        row.assignedDays > 0 ||
        row.approvedDays > 0 ||
        row.pendingDays > 0 ||
        (row.grantedDays ?? 0) > 0 ||
        (row.reservedDays ?? 0) > 0 ||
        (row.consumedDays ?? 0) > 0,
    );
  }, [balancesQuery.data, showEdit]);

  const hasNegativeBalance = visibleBalances.some(
    (row) => row.availableDays < 0 || row.projectedAvailableDays < 0,
  );

  const openEdit = (row: EmployeeAbsenceBalanceSummary) => {
    setEditTarget(row);
    setOperation("CREDIT");
    setQuantity("");
    setReason("");
    setError(null);
  };

  const columns = useMemo<DataTableColumn<EmployeeAbsenceBalanceSummary>[]>(
    () => [
      { key: "type", header: "Tipo", getValue: (row) => safeText(row.absenceType?.name ?? null) },
      {
        key: "granted",
        header: "Otorgados",
        getValue: (row) => row.grantedDays ?? row.assignedDays,
        align: "right",
      },
      {
        key: "reserved",
        header: "Reservados",
        getValue: (row) => row.reservedDays ?? row.pendingDays,
        align: "right",
      },
      {
        key: "consumed",
        header: "Consumidos",
        getValue: (row) => row.consumedDays ?? row.approvedDays,
        align: "right",
      },
      { key: "available", header: "Disponibles", getValue: (row) => row.availableDays, align: "right" },
      {
        key: "actions",
        header: "Acción",
        align: "right" as const,
        render: (row: EmployeeAbsenceBalanceSummary) => (
          <Group gap="xs" justify="flex-end" wrap="nowrap">
            <Button size="compact-xs" variant="subtle" onClick={() => setHistoryTarget(row)}>
              Historial
            </Button>
            {showEdit ? (
              <Button size="compact-xs" variant="light" onClick={() => openEdit(row)}>
                Ajustar
              </Button>
            ) : null}
          </Group>
        ),
      },
    ],
    [showEdit],
  );

  const mobileCard = useMemo<DataTableMobileCardConfig<EmployeeAbsenceBalanceSummary>>(
    () => ({
      title: (row) => safeText(row.absenceType?.name ?? null),
      fields: [
        {
          key: "available",
          label: "Disponibles",
          getValue: (row) => String(row.availableDays),
          visibility: "always",
        },
        {
          key: "granted",
          label: "Otorgados",
          getValue: (row) => String(row.grantedDays ?? row.assignedDays),
          visibility: "always",
        },
        {
          key: "reserved",
          label: "Reservados",
          getValue: (row) => String(row.reservedDays ?? row.pendingDays),
          visibility: "expanded",
        },
        {
          key: "consumed",
          label: "Consumidos",
          getValue: (row) => String(row.consumedDays ?? row.approvedDays),
          visibility: "expanded",
        },
      ],
    }),
    [],
  );

  const movementColumns = useMemo<DataTableColumn<AbsenceBalanceMovement>[]>(
    () => [
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
    ],
    [],
  );

  const handleSave = async () => {
    if (!editTarget) {
      return;
    }

    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError("La cantidad debe ser un número mayor a 0.");
      return;
    }
    if (!reason.trim()) {
      setError("El motivo es obligatorio.");
      return;
    }

    try {
      await adjustMutation.mutateAsync({
        absenceTypeId: editTarget.absenceType.id,
        year,
        quantity: parsedQuantity,
        operation,
        reason: reason.trim(),
      });
      setEditTarget(null);
      notifications.show({
        color: "green",
        message: "Ajuste de saldo registrado correctamente.",
      });
      onBalanceSaved?.();
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, "No se pudo registrar el ajuste."));
    }
  };

  if (balancesQuery.isLoading) {
    return <LoadingState />;
  }

  return (
    <Stack gap="md">
      {balanceImpact ? (
        balanceImpact.deductsBalance ? (
          <Stack gap="sm">
            {balanceImpact.hasSufficientBalance === false ? (
              <>
                <Alert color="red">
                  El empleado no tiene saldo suficiente para aprobar esta solicitud.
                </Alert>
                {showEdit ? (
                  <Alert color="blue">
                    Para aprobar esta solicitud, primero cargá o ajustá el saldo del empleado.
                  </Alert>
                ) : null}
              </>
            ) : null}
            <Text size="sm" c="dimmed">
              Año {balanceImpact.year}
            </Text>
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
          <Alert color="blue">{balanceImpact.message ?? "Este tipo de ausencia no descuenta saldo."}</Alert>
        )
      ) : null}

      {hasNegativeBalance ? (
        <Alert color="yellow">
          El empleado tiene saldo negativo para este tipo de ausencia. Revisá los días otorgados o las
          solicitudes aprobadas.
        </Alert>
      ) : null}

      {visibleBalances.length > 0 ? (
        <DataTable
          rows={visibleBalances}
          columns={columns}
          getRowKey={(row) => row.absenceType.id}
          emptyTitle={`No hay tipos de ausencia activos para mostrar en ${year}.`}
          mobileView="summary"
          mobileCard={mobileCard}
          aria-label="Saldo de ausencias del empleado"
        />
      ) : (
        <Text c="dimmed">No hay tipos de ausencia activos para mostrar en {year}.</Text>
      )}

      <ResponsiveModal
        opened={Boolean(editTarget)}
        onClose={adjustMutation.isPending ? () => undefined : () => setEditTarget(null)}
        title={`Ajustar saldo · ${editTarget?.absenceType.name} · ${year}`}
        bodyMode="normal"
        closeOnClickOutside={!adjustMutation.isPending}
        closeOnEscape={!adjustMutation.isPending}
        footer={
          <Group justify="flex-end" gap="sm" wrap="wrap">
            <Button
              variant="default"
              onClick={() => setEditTarget(null)}
              disabled={adjustMutation.isPending}
            >
              Cancelar
            </Button>
            <Button onClick={() => void handleSave()} loading={adjustMutation.isPending}>
              Confirmar ajuste
            </Button>
          </Group>
        }
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Disponibles actuales: {editTarget?.availableDays ?? "—"} · Otorgados:{" "}
            {editTarget?.grantedDays ?? editTarget?.assignedDays ?? "—"}
          </Text>
          <Select
            label="Operación"
            data={[
              { value: "CREDIT", label: "Agregar días" },
              { value: "DEBIT", label: "Descontar días" },
            ]}
            value={operation}
            onChange={(value) =>
              setOperation((value as AbsenceBalanceAdjustmentOperation | null) ?? "CREDIT")
            }
            disabled={adjustMutation.isPending}
          />
          <NumberInput
            label="Cantidad"
            value={quantity === "" ? "" : Number(quantity)}
            onChange={(value) => setQuantity(value === "" || value === undefined ? "" : String(value))}
            min={0.5}
            step={0.5}
            decimalScale={1}
            disabled={adjustMutation.isPending}
          />
          <Textarea
            label="Motivo"
            description="Obligatorio. Queda registrado en el historial de movimientos."
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            minRows={2}
            required
            disabled={adjustMutation.isPending}
          />
          {error ? <Alert color="red">{error}</Alert> : null}
        </Stack>
      </ResponsiveModal>

      <ResponsiveModal
        opened={Boolean(historyTarget)}
        onClose={() => setHistoryTarget(null)}
        title={`Historial · ${historyTarget?.absenceType.name} · ${year}`}
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
              columns={movementColumns}
              getRowKey={(row) => row.id}
              emptyTitle="No hay movimientos para este saldo."
              aria-label="Historial de movimientos de saldo"
            />
          ) : null}
        </Stack>
      </ResponsiveModal>
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
    { label: "Días otorgados", value: input.assignedDays },
    { label: "Días consumidos", value: input.approvedDays },
    { label: "Días reservados", value: input.pendingDays },
    { label: "Saldo disponible", value: input.availableDays },
    { label: "Días solicitados", value: input.requestDays },
    { label: "Saldo luego de aprobar", value: input.availableAfterApproval },
  ];

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
      {fields.map((field) => (
        <Text key={field.label} size="sm">
          <strong>{field.label}:</strong> {field.value ?? "—"}
        </Text>
      ))}
    </SimpleGrid>
  );
}
