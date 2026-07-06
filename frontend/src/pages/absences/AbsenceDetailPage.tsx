import { Alert, Button, Group, Modal, Stack, Text, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { useQueryClient } from "@tanstack/react-query";
import { EmployeeAbsenceBalanceCard } from "../../components/absences/EmployeeAbsenceBalanceCard";
import { EmployeeAbsenceHistoryTable } from "../../components/absences/EmployeeAbsenceHistoryTable";
import {
  DataTable,
  DetailFieldGrid,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
  StatusBadge,
  type DataTableColumn,
} from "../../design-system";
import {
  useAbsenceRequest,
  useApproveAbsenceRequest,
  useNeedsInfoAbsenceRequest,
  useRejectAbsenceRequest,
} from "../../hooks/useAbsences";
import type { AffectedOperationWarning } from "../../types/absence";
import { formatDateTime } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
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
      await approveMutation.mutateAsync();
      notify("Solicitud aprobada.");
    } catch (error) {
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

  return (
    <Stack gap="md">
      <PageHeader
        title="Detalle de solicitud de ausencia"
        description={`${request.employee.name} · ${formatAbsenceDate(request.startDate)} - ${formatAbsenceDate(request.endDate)}`}
        action={
          <Group gap="xs" align="center">
            {canReview ? (
              <>
                {insufficientBalance ? (
                  <Alert color="blue" py={4}>
                    Para aprobar esta solicitud, primero cargá o ajustá el saldo del empleado.
                  </Alert>
                ) : null}
                <Button onClick={() => void handleApprove()} disabled={approveMutation.isPending || insufficientBalance}>
                  Aprobar
                </Button>
                <Button color="yellow" variant="default" onClick={openNeedsInfoModal}>
                  Requiere información
                </Button>
                <Button color="red" variant="default" onClick={openRejectModal}>
                  Rechazar
                </Button>
              </>
            ) : null}
            <Button variant="default" onClick={goBackToList}>
              Volver al listado
            </Button>
          </Group>
        }
      />

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

      <Modal opened={rejectOpen} onClose={closeRejectModal} title="Rechazar solicitud" centered>
        <Stack gap="md">
          <Textarea
            label="Motivo del rechazo"
            value={comment}
            onChange={(event) => setComment(event.currentTarget.value)}
            minRows={3}
            autoFocus
          />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={closeRejectModal}>
              Cancelar
            </Button>
            <Button color="red" onClick={() => void handleReject()} loading={rejectMutation.isPending}>
              Rechazar
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={needsInfoOpen}
        onClose={closeNeedsInfoModal}
        title="Solicitar más información"
        centered
      >
        <Stack gap="md">
          <Textarea
            label="Comentario para el empleado"
            value={comment}
            onChange={(event) => setComment(event.currentTarget.value)}
            minRows={3}
            autoFocus
          />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={closeNeedsInfoModal}>
              Cancelar
            </Button>
            <Button onClick={() => void handleNeedsInfo()} loading={needsInfoMutation.isPending}>
              Guardar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
