import { Alert, Button, Group, Stack, Text, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { absenceKeys } from "../../api/absence-query-keys";
import { AbsenceAttachmentsSection } from "../../components/absences/AbsenceAttachmentsSection";
import { AbsenceOperationalImpactSection } from "../../components/absences/AbsenceOperationalImpactSection";
import { EmployeeAbsenceBalanceCard } from "../../components/absences/EmployeeAbsenceBalanceCard";
import { EmployeeAbsenceHistoryTable } from "../../components/absences/EmployeeAbsenceHistoryTable";
import { EntityLink } from "../../components/entity-link";
import { buildAbsenceApprovalSuccessMessage } from "../../components/operations/operation-workday-display";
import {
  DataTable,
  DetailFieldGrid,
  ErrorState,
  LoadingState,
  PageHeader,
  ResponsiveModal,
  SectionCard,
  StatusBadge,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
import {
  useAbsenceOperationalImpact,
  useAbsenceRequest,
  useAbsenceTypes,
  useApproveAbsenceRequest,
  useCancelAbsenceRequest,
  useNeedsInfoAbsenceRequest,
  useRejectAbsenceRequest,
} from "../../hooks/useAbsences";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { useOperationalQueryEnabled } from "../../hooks/useOperationalQueryEnabled";
import type { AffectedOperationWarning } from "../../types/absence";
import {
  absenceEventTypeLabels,
  absenceRequestedViaLabels,
  absenceStatusLabels,
  absenceTypeLabels,
  formatAbsenceDate,
} from "../../utils/absence-labels";
import { formatDateTime } from "../../utils/dates";
import { getApiErrorMessage, isAbsenceWorkdaySyncError } from "../../utils/errors";
import { operationStatusLabels } from "../../utils/labels";
import { hasPermission } from "../../utils/permissions";
import { AbsenceNeedsInfoEditor } from "./AbsenceNeedsInfoEditor";
import { AbsenceReviewActions } from "./AbsenceReviewActions";
import { absenceConflictUserMessage } from "./absence-conflict-message";
import {
  canAdminEditNeedsInfo,
  canShowAbsenceReviewActions,
} from "./absence-review-permissions";

const affectedOperationColumns: DataTableColumn<AffectedOperationWarning>[] = [
  {
    key: "service",
    header: "Servicio",
    render: (row) => (
      <EntityLink entityType="service" entityId={row.serviceId} label={row.serviceName} />
    ),
  },
  {
    key: "operation",
    header: "Operación",
    render: (row) => (
      <EntityLink
        entityType="operation"
        entityId={row.operationId}
        label={formatDateTime(row.scheduledStart)}
      />
    ),
  },
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
];

const affectedOperationMobileCard: DataTableMobileCardConfig<AffectedOperationWarning> = {
  title: (row) => (
    <EntityLink entityType="service" entityId={row.serviceId} label={row.serviceName} />
  ),
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
      key: "operation",
      label: "Operación",
      render: (row) => (
        <EntityLink
          entityType="operation"
          entityId={row.operationId}
          label={formatDateTime(row.scheduledStart)}
        />
      ),
      visibility: "always",
    },
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
  const { companyId } = useOperationalQueryEnabled();
  const permissionsQuery = useCompanyPermissions();
  const canUpdateBalance = hasPermission(
    permissionsQuery.data?.permissions,
    "absences:balance:update",
  );

  const requestQuery = useAbsenceRequest(id);
  const typesQuery = useAbsenceTypes();
  const approveMutation = useApproveAbsenceRequest(id ?? "");
  const rejectMutation = useRejectAbsenceRequest(id ?? "");
  const needsInfoMutation = useNeedsInfoAbsenceRequest(id ?? "");
  const cancelMutation = useCancelAbsenceRequest(id ?? "");

  const [rejectOpen, setRejectOpen] = useState(false);
  const [needsInfoOpen, setNeedsInfoOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [comment, setComment] = useState("");

  const impactQuery = useAbsenceOperationalImpact(id);

  const typeOptions = useMemo(
    () =>
      (typesQuery.data ?? []).map((type) => ({
        value: type.id,
        label: absenceTypeLabels[type.code as keyof typeof absenceTypeLabels] ?? type.name,
        allowsHalfDay: type.allowsHalfDay,
        dayCountingMode: type.dayCountingMode,
      })),
    [typesQuery.data],
  );

  if (!id) {
    return <ErrorState message="Solicitud no encontrada." />;
  }

  if (requestQuery.isLoading || permissionsQuery.isPending) {
    return <LoadingState />;
  }

  if (requestQuery.isError || !requestQuery.data) {
    return <ErrorState message={getApiErrorMessage(requestQuery.error, "Solicitud no encontrada.")} />;
  }

  const detail = requestQuery.data;
  const canReview = canShowAbsenceReviewActions(permissionsQuery.data?.permissions, detail.status);
  const canEditNeedsInfo = canAdminEditNeedsInfo(permissionsQuery.data?.permissions, detail.status);
  const canManageAttachments = hasPermission(
    permissionsQuery.data?.permissions,
    "absences:review",
  );
  const attachmentType = typesQuery.data?.find((type) => type.id === detail.absenceTypeId);
  const attachmentPolicy =
    attachmentType?.attachmentPolicy ??
    (attachmentType?.requiresAttachment ? "REQUIRED" : "OPTIONAL");
  const balanceYear =
    detail.balanceImpact?.year ?? Number.parseInt(detail.startDate.slice(0, 4), 10);
  const insufficientBalance =
    detail.balanceImpact?.deductsBalance === true &&
    detail.balanceImpact.hasSufficientBalance === false;

  const closeRejectModal = () => {
    setRejectOpen(false);
    setComment("");
  };

  const closeNeedsInfoModal = () => {
    setNeedsInfoOpen(false);
    setComment("");
  };

  const notify = (message: string, color: "green" | "red" = "green") => {
    notifications.show({ color, message });
  };

  const handleApprove = async () => {
    try {
      const result = await approveMutation.mutateAsync();
      setApproveOpen(false);
      notify(
        buildAbsenceApprovalSuccessMessage({
          justified: result.workdayReconciliation?.justified,
          attendanceConflicts: result.workdayReconciliation?.attendanceConflicts,
        }),
      );
      void impactQuery.refetch();
    } catch (error) {
      if (isAbsenceWorkdaySyncError(error)) {
        notify(getApiErrorMessage(error), "red");
        return;
      }
      notify(absenceConflictUserMessage(error), "red");
      void requestQuery.refetch();
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
      notify(absenceConflictUserMessage(error), "red");
      void requestQuery.refetch();
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
      notify("La solicitud quedó marcada como requiere información.");
    } catch (error) {
      notify(absenceConflictUserMessage(error), "red");
      void requestQuery.refetch();
    }
  };

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync();
      notify("Solicitud cancelada.");
    } catch (error) {
      notify(absenceConflictUserMessage(error), "red");
      void requestQuery.refetch();
    }
  };

  return (
    <Stack gap="md">
      <PageHeader
        title="Detalle de solicitud de ausencia"
        description={`${detail.employee.name} · ${formatAbsenceDate(detail.startDate)} - ${formatAbsenceDate(detail.endDate)}`}
        action={
          <AbsenceReviewActions
            canReview={canReview}
            insufficientBalance={insufficientBalance}
            approvePending={approveMutation.isPending}
            onApprove={() => {
              void impactQuery.refetch();
              setApproveOpen(true);
            }}
            onNeedsInfo={() => {
              setComment("");
              setNeedsInfoOpen(true);
            }}
            onCancel={() => void handleCancel()}
            onReject={() => {
              setComment("");
              setRejectOpen(true);
            }}
            onBack={goBackToList}
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
            {
              label: "Empleado",
              value: (
                <EntityLink
                  entityType="employee"
                  entityId={detail.employee?.id ?? detail.employeeId}
                  label={`${detail.employee.name} (${detail.employee.phoneNumber})`}
                />
              ),
            },
            {
              label: "Tipo",
              value:
                absenceTypeLabels[detail.absenceType.code as keyof typeof absenceTypeLabels] ??
                detail.absenceType.name,
            },
            { label: "Inicio", value: formatAbsenceDate(detail.startDate) },
            { label: "Fin", value: formatAbsenceDate(detail.endDate) },
            { label: "Días", value: detail.totalDays },
            { label: "Motivo", value: detail.reason },
            {
              label: "Estado",
              value: <StatusBadge label={absenceStatusLabels[detail.status]} tone="neutral" />,
            },
            { label: "Origen", value: absenceRequestedViaLabels[detail.requestedVia] },
            { label: "Creada", value: formatDateTime(detail.createdAt) },
            { label: "Revisada por", value: detail.reviewerName ?? "—" },
            { label: "Revisada el", value: detail.reviewedAt ? formatDateTime(detail.reviewedAt) : "—" },
            { label: "Comentario de revisión", value: detail.reviewComment ?? "—" },
          ]}
        />
      </SectionCard>

      {canEditNeedsInfo ? (
        <AbsenceNeedsInfoEditor
          key={`${detail.id}-${detail.updatedAt}`}
          detail={detail}
          typeOptions={typeOptions}
          onSaved={() => {
            void requestQuery.refetch();
          }}
          onConflict={(error) => {
            notify(absenceConflictUserMessage(error), "red");
            void requestQuery.refetch();
          }}
        />
      ) : null}

      <AbsenceAttachmentsSection
        requestId={detail.id}
        requestStatus={detail.status}
        attachmentPolicy={attachmentPolicy}
        canManage={canManageAttachments}
      />

      <SectionCard title="Saldo del empleado">
        <EmployeeAbsenceBalanceCard
          employeeId={detail.employeeId}
          year={balanceYear}
          balanceImpact={detail.balanceImpact}
          showEdit={canUpdateBalance}
          onBalanceSaved={() => {
            if (id) {
              void queryClient.invalidateQueries({
                queryKey: absenceKeys.detail(companyId, id),
              });
            }
          }}
        />
      </SectionCard>

      <SectionCard title={`Historial del empleado (${balanceYear})`}>
        <EmployeeAbsenceHistoryTable employeeId={detail.employeeId} year={balanceYear} />
      </SectionCard>

      <AbsenceOperationalImpactSection requestId={detail.id} />

      <SectionCard title="Operaciones afectadas">
        {detail.affectedOperations.length === 0 ? (
          <Text c="dimmed">
            No se detectaron operaciones asignadas que se superpongan con esta ausencia.
          </Text>
        ) : (
          <Stack gap="md">
            <Alert color="yellow">
              Esta solicitud se superpone con {detail.affectedOperations.length} operación(es)
              asignado(s). Podés aprobar igualmente, pero conviene revisar la planificación.
            </Alert>
            <DataTable
              rows={detail.affectedOperations}
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
          {detail.events.map((event) => (
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

      <ResponsiveModal
        opened={approveOpen}
        onClose={approveMutation.isPending ? () => undefined : () => setApproveOpen(false)}
        title="Confirmar aprobación"
        bodyMode="normal"
        closeOnClickOutside={!approveMutation.isPending}
        closeOnEscape={!approveMutation.isPending}
        footer={
          <Group justify="flex-end" gap="sm" wrap="wrap">
            <Button
              variant="default"
              onClick={() => setApproveOpen(false)}
              disabled={approveMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              color="green"
              onClick={() => void handleApprove()}
              loading={approveMutation.isPending}
            >
              Aprobar
            </Button>
          </Group>
        }
      >
        <Stack gap="sm">
          {impactQuery.data ? (
            <>
              <Text size="sm">
                Impacto estimado: {impactQuery.data.affectedOperations} operación(es),{" "}
                {impactQuery.data.affectedWorkdays} jornada(s),{" "}
                {impactQuery.data.attendanceConflicts} conflicto(s) de asistencia.
              </Text>
              {impactQuery.data.requiresManualAction ? (
                <Alert color="yellow">
                  Hay conflictos o operaciones afectadas. Podés aprobar igualmente; las asignaciones
                  no se eliminan automáticamente.
                </Alert>
              ) : (
                <Text c="dimmed" size="sm">
                  No se detectaron conflictos críticos de planificación.
                </Text>
              )}
            </>
          ) : (
            <Text c="dimmed" size="sm">
              Calculando impacto operativo…
            </Text>
          )}
        </Stack>
      </ResponsiveModal>
    </Stack>
  );
}
