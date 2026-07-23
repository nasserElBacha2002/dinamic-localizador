import { Alert, Button, Group, Stack, Text, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { useQueryClient } from "@tanstack/react-query";
import { EmployeeAbsenceBalanceCard } from "../../components/absences/EmployeeAbsenceBalanceCard";
import { EmployeeAbsenceHistoryTable } from "../../components/absences/EmployeeAbsenceHistoryTable";
import {
  ActionMenu,
  DataTable,
  DetailFieldGrid,
  ErrorState,
  LoadingState,
  PageHeader,
  ResponsiveModal,
  SectionCard,
  StatusBadge,
  type ActionMenuItem,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
import {
  useAbsenceRequest,
  useApproveAbsenceRequest,
  useNeedsInfoAbsenceRequest,
  useRejectAbsenceRequest,
} from "../../hooks/useAbsences";
import type { AffectedOperationWarning } from "../../types/absence";
import { formatDateTime } from "../../utils/dates";
import { getApiErrorMessage, isAbsenceWorkdaySyncError } from "../../utils/errors";
import { buildAbsenceApprovalSuccessMessage } from "../../components/operations/operation-workday-display";
import {
  absenceEventTypeLabels,
  absenceRequestedViaLabels,
  absenceStatusLabels,
  absenceTypeLabels,
  formatAbsenceDate,
} from "../../utils/absence-labels";
import { operationStatusLabels } from "../../utils/labels";

const affectedOperationColumns: DataTableColumn<AffectedOperationWarning>[] = [
  { key: "service", header: "Servicio", getValue: (row) => row.serviceName },
  { key: "start", header: "Inicio", getValue: (row) => formatDateTime(row.scheduledStart) },
  {
    key: "end",
    header: "Fin",
    getValue: (row) => (row.scheduledEnd ? formatDateTime(row.scheduledEnd) : "—"),
  },
  {
    key: "status",
    header: "Estado",
    getValue: (row) =>
      operationStatusLabels[row.status as keyof typeof operationStatusLabels] ?? row.status,
  },
  {
    key: "action",
    header: "Acción",
    align: "right",
    render: (row) => (
      <Button component={RouterLink} to={`/operations/${row.operationId}`} size="compact-xs" variant="light">
        Ver operación
      </Button>
    ),
  },
];

const affectedOperationMobileCard: DataTableMobileCardConfig<AffectedOperationWarning> = {
  title: (row) => row.serviceName,
  status: (row) => (
    <StatusBadge
      label={
        operationStatusLabels[row.status as keyof typeof operationStatusLabels] ?? row.status
      }
      tone="neutral"
      variant="light"
    />
  ),
  fields: [
    {
      key: "start",
      label: "Inicio",
      getValue: (row) => formatDateTime(row.scheduledStart),
      visibility: "always",
    },
    {
      key: "end",
      label: "Fin",
      getValue: (row) => (row.scheduledEnd ? formatDateTime(row.scheduledEnd) : "—"),
      visibility: "always",
    },
  ],
};

export function AbsenceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { goBackToList } = useListBackNavigation("/absences");
  const queryClient = useQueryClient();
  const requestQuery = useAbsenceRequest(id);
  const approveMutation = useApproveAbsenceRequest(id ?? "");
  const rejectMutation = useRejectAbsenceRequest(id ?? "");
  const needsInfoMutation = useNeedsInfoAbsenceRequest(id ?? "");

  const [rejectOpen, setRejectOpen] = useState(false);
  const [needsInfoOpen, setNeedsInfoOpen] = useState(false);
  const [comment, setComment] = useState("");

  if (!id) {
    return <ErrorState message="Solicitud no encontrada." />;
  }

  if (requestQuery.isLoading) {
    return <LoadingState />;
  }

  if (requestQuery.isError || !requestQuery.data) {
    return <ErrorState message={getApiErrorMessage(requestQuery.error, "Solicitud no encontrada.")} />;
  }

  const request = requestQuery.data;
  const canReview = request.status === "PENDING" || request.status === "NEEDS_INFO";
  const balanceYear =
    request.balanceImpact?.year ?? Number.parseInt(request.startDate.slice(0, 4), 10);
  const insufficientBalance =
    request.balanceImpact?.deductsBalance === true &&
    request.balanceImpact.hasSufficientBalance === false;

  const closeRejectModal = () => {
    setRejectOpen(false);
    setComment("");
  };

  const closeNeedsInfoModal = () => {
    setNeedsInfoOpen(false);
    setComment("");
  };

  const openRejectModal = () => {
    setComment("");
    setRejectOpen(true);
  };

  const openNeedsInfoModal = () => {
    setComment("");
    setNeedsInfoOpen(true);
  };

  const notify = (message: string, color: "green" | "red" = "green") => {
    notifications.show({ color, message });
  };

  const handleApprove = async () => {
    try {
      const result = await approveMutation.mutateAsync();
      notify(
        buildAbsenceApprovalSuccessMessage({
          justified: result.workdayReconciliation?.justified,
          attendanceConflicts: result.workdayReconciliation?.attendanceConflicts,
        }),
      );
    } catch (error) {
      if (isAbsenceWorkdaySyncError(error)) {
        notify(getApiErrorMessage(error), "red");
        return;
      }
      notify(getApiErrorMessage(error), "red");
    }
  };

  const handleReject = async () => {
    if (!comment.trim()) {
      notify("El motivo del rechazo es obligatorio.", "red");
      return;
    }

    try {
      await rejectMutation.mutateAsync(comment.trim());
      closeRejectModal();
      notify("Solicitud rechazada.");
    } catch (error) {
      notify(getApiErrorMessage(error), "red");
    }
  };

  const handleNeedsInfo = async () => {
    if (!comment.trim()) {
      notify("El comentario es obligatorio.", "red");
      return;
    }

    try {
      await needsInfoMutation.mutateAsync(comment.trim());
      closeNeedsInfoModal();
      notify(
        "La solicitud quedó marcada como requiere información. En esta fase el empleado todavía no será notificado automáticamente.",
      );
    } catch (error) {
      notify(getApiErrorMessage(error), "red");
    }
  };

  const reviewMenuItems: ActionMenuItem[] = canReview
    ? [
        {
          key: "needs-info",
          label: "Requiere información",
          onClick: openNeedsInfoModal,
        },
        {
          key: "reject",
          label: "Rechazar",
          destructive: true,
          onClick: openRejectModal,
        },
      ]
    : [];

  return (
    <Stack gap="md">
      <PageHeader
        title="Detalle de solicitud de ausencia"
        description={`${request.employee.name} · ${formatAbsenceDate(request.startDate)} - ${formatAbsenceDate(request.endDate)}`}
        action={
          <ActionMenu
            primary={
              canReview ? (
                <Button
                  onClick={() => void handleApprove()}
                  disabled={approveMutation.isPending || insufficientBalance}
                  loading={approveMutation.isPending}
                >
                  Aprobar
                </Button>
              ) : (
                <Button variant="default" onClick={goBackToList}>
                  Volver al listado
                </Button>
              )
            }
            items={
              canReview
                ? [
                    ...reviewMenuItems,
                    { key: "back", label: "Volver al listado", onClick: goBackToList },
                  ]
                : []
            }
            menuLabel="Más acciones de la solicitud"
          />
        }
      />
      {canReview && insufficientBalance ? (
        <Alert color="blue">
          Para aprobar esta solicitud, primero cargá o ajustá el saldo del empleado.
        </Alert>
      ) : null}

      <SectionCard title="Datos generales">
        <DetailFieldGrid
          fields={[
            { label: "Empleado", value: `${request.employee.name} (${request.employee.phoneNumber})` },
            {
              label: "Tipo",
              value:
                absenceTypeLabels[request.absenceType.code as keyof typeof absenceTypeLabels] ??
                request.absenceType.name,
            },
            { label: "Inicio", value: formatAbsenceDate(request.startDate) },
            { label: "Fin", value: formatAbsenceDate(request.endDate) },
            { label: "Días", value: request.totalDays },
            { label: "Motivo", value: request.reason },
            {
              label: "Estado",
              value: <StatusBadge label={absenceStatusLabels[request.status]} tone="neutral" />,
            },
            { label: "Origen", value: absenceRequestedViaLabels[request.requestedVia] },
            { label: "Creada", value: formatDateTime(request.createdAt) },
            { label: "Revisada por", value: request.reviewerName ?? "—" },
            { label: "Revisada el", value: request.reviewedAt ? formatDateTime(request.reviewedAt) : "—" },
            { label: "Comentario de revisión", value: request.reviewComment ?? "—" },
          ]}
        />
      </SectionCard>

      <SectionCard title="Saldo del empleado">
        <EmployeeAbsenceBalanceCard
          employeeId={request.employeeId}
          year={balanceYear}
          balanceImpact={request.balanceImpact}
          onBalanceSaved={() => {
            if (id) {
              queryClient.invalidateQueries({ queryKey: ["absence-request", id] });
            }
          }}
        />
      </SectionCard>

      <SectionCard title={`Historial del empleado (${balanceYear})`}>
        <EmployeeAbsenceHistoryTable employeeId={request.employeeId} year={balanceYear} />
      </SectionCard>

      <SectionCard title="Operaciones afectadas">
        {request.affectedOperations.length === 0 ? (
          <Text c="dimmed">
            No se detectaron operaciones asignadas que se superpongan con esta ausencia.
          </Text>
        ) : (
          <Stack gap="md">
            <Alert color="yellow">
              Esta solicitud se superpone con {request.affectedOperations.length} operación(es)
              asignado(s). Podés aprobar igualmente, pero conviene revisar la planificación.
            </Alert>
            <DataTable
              rows={request.affectedOperations}
              columns={affectedOperationColumns}
              getRowKey={(row) => row.operationId}
              mobileView="cards"
              mobileCard={affectedOperationMobileCard}
              aria-label="Operaciones afectadas por la ausencia"
            />
          </Stack>
        )}
      </SectionCard>

      <SectionCard title="Historial">
        <Stack gap="xs">
          {request.events.map((event) => (
            <Text key={event.id} size="sm">
              {formatDateTime(event.createdAt)} ·{" "}
              {absenceEventTypeLabels[event.eventType as keyof typeof absenceEventTypeLabels] ??
                event.eventType}
              {event.performerName ? ` · ${event.performerName}` : ""}
              {event.comment ? ` · ${event.comment}` : ""}
            </Text>
          ))}
        </Stack>
      </SectionCard>

      <ResponsiveModal
        opened={rejectOpen}
        onClose={rejectMutation.isPending ? () => undefined : closeRejectModal}
        title="Rechazar solicitud"
        bodyMode="normal"
        closeOnClickOutside={!rejectMutation.isPending}
        closeOnEscape={!rejectMutation.isPending}
        footer={
          <Group justify="flex-end" gap="sm" wrap="wrap">
            <Button variant="default" onClick={closeRejectModal} disabled={rejectMutation.isPending}>
              Cancelar
            </Button>
            <Button
              color="red"
              onClick={() => void handleReject()}
              loading={rejectMutation.isPending}
            >
              Rechazar
            </Button>
          </Group>
        }
      >
        <Textarea
          label="Motivo del rechazo"
          value={comment}
          onChange={(event) => setComment(event.currentTarget.value)}
          minRows={3}
          autoFocus
          disabled={rejectMutation.isPending}
        />
      </ResponsiveModal>

      <ResponsiveModal
        opened={needsInfoOpen}
        onClose={needsInfoMutation.isPending ? () => undefined : closeNeedsInfoModal}
        title="Solicitar más información"
        bodyMode="normal"
        closeOnClickOutside={!needsInfoMutation.isPending}
        closeOnEscape={!needsInfoMutation.isPending}
        footer={
          <Group justify="flex-end" gap="sm" wrap="wrap">
            <Button
              variant="default"
              onClick={closeNeedsInfoModal}
              disabled={needsInfoMutation.isPending}
            >
              Cancelar
            </Button>
            <Button onClick={() => void handleNeedsInfo()} loading={needsInfoMutation.isPending}>
              Guardar
            </Button>
          </Group>
        }
      >
        <Textarea
          label="Comentario para el empleado"
          value={comment}
          onChange={(event) => setComment(event.currentTarget.value)}
          minRows={3}
          autoFocus
          disabled={needsInfoMutation.isPending}
        />
      </ResponsiveModal>
    </Stack>
  );
}
