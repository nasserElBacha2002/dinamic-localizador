import { Alert, Button, Group, Select, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";
import { Link as RouterLink, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { absenceKeys } from "../../api/absence-query-keys";
import { EmployeeAbsenceBalanceCard } from "../../components/absences/EmployeeAbsenceBalanceCard";
import { EmployeeAbsenceHistoryTable } from "../../components/absences/EmployeeAbsenceHistoryTable";
import { buildAbsenceApprovalSuccessMessage } from "../../components/operations/operation-workday-display";
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
  useAbsenceTypes,
  useApproveAbsenceRequest,
  useCancelAbsenceRequest,
  useNeedsInfoAbsenceRequest,
  useRejectAbsenceRequest,
  useResubmitAbsenceRequest,
  useUpdateNeedsInfoAbsenceRequest,
} from "../../hooks/useAbsences";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { useOperationalQueryEnabled } from "../../hooks/useOperationalQueryEnabled";
import type { AbsenceRequestDetail, AffectedOperationWarning } from "../../types/absence";
import {
  absenceEventTypeLabels,
  absenceRequestedViaLabels,
  absenceStatusLabels,
  absenceTypeLabels,
  formatAbsenceDate,
} from "../../utils/absence-labels";
import { formatDateTime } from "../../utils/dates";
import { getApiErrorMessage, isAbsenceWorkdaySyncError, parseApiError } from "../../utils/errors";
import { operationStatusLabels } from "../../utils/labels";
import { hasPermission } from "../../utils/permissions";

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

function conflictUserMessage(error: unknown): string {
  const parsed = parseApiError(error);
  if (parsed.status === 403) {
    return "No tenés permiso para realizar esta acción.";
  }
  if (parsed.status === 409 || parsed.code === "ABSENCE_ALREADY_REVIEWED") {
    return (
      parsed.message ||
      "La solicitud cambió de estado. Recargá el detalle e intentá de nuevo."
    );
  }
  return getApiErrorMessage(error);
}

function NeedsInfoEditSection({
  detail,
  typeOptions,
  onSaved,
  onConflict,
}: {
  detail: AbsenceRequestDetail;
  typeOptions: Array<{ value: string; label: string }>;
  onSaved: () => void;
  onConflict: (error: unknown) => void;
}) {
  const updateMutation = useUpdateNeedsInfoAbsenceRequest(detail.id);
  const resubmitMutation = useResubmitAbsenceRequest(detail.id);
  const [editReason, setEditReason] = useState(detail.reason);
  const [editStartDate, setEditStartDate] = useState(detail.startDate);
  const [editEndDate, setEditEndDate] = useState(detail.endDate);
  const [editAbsenceTypeId, setEditAbsenceTypeId] = useState(detail.absenceTypeId);

  const notify = (message: string, color: "green" | "red" = "green") => {
    notifications.show({ color, message });
  };

  const handleSaveNeedsInfoEdit = async () => {
    if (!editReason.trim() || editReason.trim().length < 3) {
      notify("El motivo es obligatorio (mínimo 3 caracteres).", "red");
      return;
    }
    if (!editStartDate || !editEndDate) {
      notify("Las fechas son obligatorias.", "red");
      return;
    }
    if (editStartDate > editEndDate) {
      notify("La fecha de inicio no puede ser posterior a la fecha de fin.", "red");
      return;
    }

    try {
      await updateMutation.mutateAsync({
        reason: editReason.trim(),
        startDate: editStartDate,
        endDate: editEndDate,
        absenceTypeId: editAbsenceTypeId || undefined,
      });
      notify("Solicitud actualizada. Reenviála para volver a revisión.");
      onSaved();
    } catch (error) {
      onConflict(error);
    }
  };

  const handleResubmit = async () => {
    try {
      await resubmitMutation.mutateAsync();
      notify("Solicitud reenviada a revisión.");
      onSaved();
    } catch (error) {
      onConflict(error);
    }
  };

  return (
    <SectionCard title="Editar y reenviar (requiere información)">
      <Stack gap="md">
        <Alert color="blue">
          Corregí los datos y usá Reenviar para volver a dejar la solicitud pendiente de revisión.
        </Alert>
        <Select
          label="Tipo de ausencia"
          data={typeOptions}
          value={editAbsenceTypeId}
          onChange={(value) => setEditAbsenceTypeId(value ?? "")}
          searchable
          disabled={updateMutation.isPending || resubmitMutation.isPending}
        />
        <Group grow preventGrowOverflow={false} align="flex-start">
          <TextInput
            label="Fecha de inicio"
            type="date"
            value={editStartDate}
            onChange={(event) => setEditStartDate(event.currentTarget.value)}
            disabled={updateMutation.isPending || resubmitMutation.isPending}
          />
          <TextInput
            label="Fecha de fin"
            type="date"
            value={editEndDate}
            onChange={(event) => setEditEndDate(event.currentTarget.value)}
            disabled={updateMutation.isPending || resubmitMutation.isPending}
          />
        </Group>
        <Textarea
          label="Motivo"
          value={editReason}
          onChange={(event) => setEditReason(event.currentTarget.value)}
          minRows={3}
          disabled={updateMutation.isPending || resubmitMutation.isPending}
        />
        <Group gap="sm">
          <Button
            variant="default"
            onClick={() => void handleSaveNeedsInfoEdit()}
            loading={updateMutation.isPending}
            disabled={resubmitMutation.isPending}
          >
            Guardar cambios
          </Button>
          <Button
            onClick={() => void handleResubmit()}
            loading={resubmitMutation.isPending}
            disabled={updateMutation.isPending}
          >
            Reenviar a revisión
          </Button>
        </Group>
      </Stack>
    </SectionCard>
  );
}

export function AbsenceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { goBackToList } = useListBackNavigation("/absences");
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  const permissionsQuery = useCompanyPermissions();
  const canReviewPermission = hasPermission(
    permissionsQuery.data?.permissions,
    "absences:review",
  );

  const requestQuery = useAbsenceRequest(id);
  const typesQuery = useAbsenceTypes();
  const approveMutation = useApproveAbsenceRequest(id ?? "");
  const rejectMutation = useRejectAbsenceRequest(id ?? "");
  const needsInfoMutation = useNeedsInfoAbsenceRequest(id ?? "");
  const cancelMutation = useCancelAbsenceRequest(id ?? "");

  const [rejectOpen, setRejectOpen] = useState(false);
  const [needsInfoOpen, setNeedsInfoOpen] = useState(false);
  const [comment, setComment] = useState("");

  const typeOptions = useMemo(
    () =>
      (typesQuery.data ?? []).map((type) => ({
        value: type.id,
        label: absenceTypeLabels[type.code as keyof typeof absenceTypeLabels] ?? type.name,
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
  const statusAllowsReview = detail.status === "PENDING" || detail.status === "NEEDS_INFO";
  const canReview = canReviewPermission && statusAllowsReview;
  const canEditNeedsInfo = canReviewPermission && detail.status === "NEEDS_INFO";
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
      notify(conflictUserMessage(error), "red");
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
      notify(conflictUserMessage(error), "red");
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
      notify(conflictUserMessage(error), "red");
      void requestQuery.refetch();
    }
  };

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync();
      notify("Solicitud cancelada.");
    } catch (error) {
      notify(conflictUserMessage(error), "red");
      void requestQuery.refetch();
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
          key: "cancel",
          label: "Cancelar solicitud",
          destructive: true,
          onClick: () => void handleCancel(),
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
        description={`${detail.employee.name} · ${formatAbsenceDate(detail.startDate)} - ${formatAbsenceDate(detail.endDate)}`}
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
            { label: "Empleado", value: `${detail.employee.name} (${detail.employee.phoneNumber})` },
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
        <NeedsInfoEditSection
          key={`${detail.id}-${detail.updatedAt}`}
          detail={detail}
          typeOptions={typeOptions}
          onSaved={() => {
            void requestQuery.refetch();
          }}
          onConflict={(error) => {
            notify(conflictUserMessage(error), "red");
            void requestQuery.refetch();
          }}
        />
      ) : null}

      <SectionCard title="Saldo del empleado">
        <EmployeeAbsenceBalanceCard
          employeeId={detail.employeeId}
          year={balanceYear}
          balanceImpact={detail.balanceImpact}
          showEdit={canReviewPermission}
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
    </Stack>
  );
}
