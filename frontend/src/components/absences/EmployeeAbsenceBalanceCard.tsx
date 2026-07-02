import { Alert, Button, Group, Modal, NumberInput, SimpleGrid, Stack, Text, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";
import {
  DataTable,
  LoadingState,
  type DataTableColumn,
} from "../../design-system";
import {
  useEmployeeAbsenceBalances,
  useUpsertEmployeeAbsenceBalance,
} from "../../hooks/useAbsences";
import type { AbsenceBalanceImpact, EmployeeAbsenceBalanceSummary } from "../../types/absence";
import { getApiErrorMessage } from "../../utils/errors";
import { safeText } from "../../utils/display-safe";

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
    if (showEdit) {
      return rows;
    }

    return rows.filter(
      (row) =>
        row.absenceType?.deductsBalance ||
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

  const columns = useMemo<DataTableColumn<EmployeeAbsenceBalanceSummary>[]>(
    () => [
      { key: "type", header: "Tipo", getValue: (row) => safeText(row.absenceType?.name ?? null) },
      { key: "assigned", header: "Asignados", getValue: (row) => row.assignedDays, align: "right" },
      { key: "approved", header: "Aprobados", getValue: (row) => row.approvedDays, align: "right" },
      { key: "pending", header: "Pendientes", getValue: (row) => row.pendingDays, align: "right" },
      { key: "available", header: "Disponibles", getValue: (row) => row.availableDays, align: "right" },
      ...(showEdit
        ? [
            {
              key: "actions",
              header: "Acción",
              align: "right" as const,
              render: (row: EmployeeAbsenceBalanceSummary) => (
                <Button size="compact-xs" variant="light" onClick={() => openEdit(row)}>
                  Editar saldo
                </Button>
              ),
            },
          ]
        : []),
    ],
    [showEdit],
  );

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
      notifications.show({
        color: "green",
        message: "Saldo actualizado correctamente.",
      });
      onBalanceSaved?.();
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, "No se pudo guardar el saldo."));
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
          El empleado tiene saldo negativo para este tipo de ausencia. Revisá los días asignados o las
          solicitudes aprobadas.
        </Alert>
      ) : null}

      {visibleBalances.length > 0 ? (
        <DataTable
          rows={visibleBalances}
          columns={columns}
          getRowKey={(row) => row.absenceType.id}
          emptyTitle={`No hay tipos de ausencia activos para mostrar en ${year}.`}
        />
      ) : (
        <Text c="dimmed">No hay tipos de ausencia activos para mostrar en {year}.</Text>
      )}

      <Modal
        opened={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title={`Editar saldo · ${editTarget?.absenceType.name} · ${year}`}
        centered
      >
        <Stack gap="md">
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
          {error ? <Alert color="red">{error}</Alert> : null}
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setEditTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSave()} loading={upsertMutation.isPending}>
              Guardar
            </Button>
          </Group>
        </Stack>
      </Modal>
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
    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
      {fields.map((field) => (
        <Text key={field.label} size="sm">
          <strong>{field.label}:</strong> {field.value ?? "—"}
        </Text>
      ))}
    </SimpleGrid>
  );
}
