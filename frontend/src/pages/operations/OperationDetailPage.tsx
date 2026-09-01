import { Box, Button, Group, SimpleGrid, Stack } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { useCompanyWorkSchedule } from "../../hooks/useCompanyWorkSchedule";
import { useCompanyModules } from "../../hooks/useCompanyModules";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useCompanySettings } from "../../hooks/useCompanySettings";
import {
  ActionMenu,
  ConfirmDialog,
  EntityPageTitle,
  ErrorState,
  LoadingState,
  MetricCard,
  PageHeader,
  SectionCard,
  StatusBadge,
  type ActionMenuItem,
  type StatusBadgeTone,
} from "../../design-system";
import { EntityLink } from "../../components/entity-link";
import { OperationTeamSection } from "../../components/operations/OperationTeamSection";
import { OperationForm, OPERATION_DETAIL_FORM_ID } from "../../components/operations/OperationForm";
import layoutClasses from "../../components/operations/operation-detail-layout.module.css";
import {
  useCancelOperation,
  useOperation,
  useOperationWorkdays,
  useReactivateOperation,
  useUpdateOperation,
} from "../../hooks/useOperations";
import type { OperationFormValues } from "../../schemas/operation.schema";
import type { OperationStatus } from "../../types/operation";
import { formatDateTime } from "../../utils/dates";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage, isRecurringWorkdaySyncError } from "../../utils/errors";
import { getEntityEditPath } from "../../utils/entity-routes";
import { getOperationDisplayName } from "../../utils/operation-display";
import { hasPermission } from "../../utils/permissions";
import { isOperationAssignable, isOperationEditable, isOperationReactivatable } from "../../utils/operation-status";
import {
  buildOperationEditDefaultValues,
  formatOperationDetailScheduleTitle,
  resolveOperationReferenceDate,
  toOperationUpdatePayload,
} from "../../utils/operation-detail-display";
import {
  formatRecurringValidity,
  operationKindLabels,
} from "../../utils/operation-schedule-display";
import {
  getOperationalTodayDate,
  pickDefaultTeamWorkday,
  type OperationTeamWorkdaySelection,
} from "../../utils/operation-team-workday";
import { operationStatusLabels } from "../../utils/labels";
import { canAccessModuleRoute } from "../../utils/company-modules";
import { buildOperationAttendanceHref } from "../../utils/statistics-deep-links";

const DEFAULT_OPERATION_TIMEZONE = "America/Argentina/Buenos_Aires";

function operationStatusTone(status: OperationStatus): StatusBadgeTone {
  switch (status) {
    case "SCHEDULED":
      return "info";
    case "IN_PROGRESS":
      return "warning";
    case "COMPLETED":
      return "success";
    case "CANCELLED":
      return "danger";
    default:
      return "neutral";
  }
}

export function OperationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { goBackToList } = useListBackNavigation("/operations");
  const operationQuery = useOperation(id);
  const companyWorkScheduleQuery = useCompanyWorkSchedule(Boolean(id));
  const companySettingsQuery = useCompanySettings(Boolean(id));
  const modulesQuery = useCompanyModules(Boolean(id));
  const permissionsQuery = useCompanyPermissions();
  const updateMutation = useUpdateOperation(id ?? "");
  const cancelMutation = useCancelOperation();
  const reactivateMutation = useReactivateOperation();

  const [editing, setEditing] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [confirmReactivateOpen, setConfirmReactivateOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [teamWorkdayOverride, setTeamWorkdayOverride] =
    useState<OperationTeamWorkdaySelection | null>(null);

  const operation = operationQuery.data;
  const isRecurring = operation?.operationKind === "RECURRING";
  const operationalTimezone =
    companySettingsQuery.data?.operationTimezone ?? DEFAULT_OPERATION_TIMEZONE;
  const operationalToday = useMemo(
    () => getOperationalTodayDate(operationalTimezone),
    [operationalTimezone],
  );
  const teamWorkdaysQuery = useOperationWorkdays(
    isRecurring ? operation?.id : undefined,
    { page: 1, limit: 90 },
  );
  const teamWorkdayOptions = teamWorkdaysQuery.data?.data ?? [];
  const teamWorkday = useMemo(() => {
    if (!isRecurring) {
      return null;
    }

    if (
      teamWorkdayOverride &&
      teamWorkdayOptions.some((workday) => workday.id === teamWorkdayOverride.workdayId)
    ) {
      return teamWorkdayOverride;
    }

    return pickDefaultTeamWorkday(teamWorkdayOptions, operationalToday);
  }, [isRecurring, teamWorkdayOverride, teamWorkdayOptions, operationalToday]);

  const showFeedback = (message: string, severity: "success" | "error" = "success") => {
    notifications.show({ color: severity === "error" ? "red" : "green", message });
  };

  const operationWorkDate = useMemo(
    () => (operation ? resolveOperationReferenceDate(operation) : ""),
    [operation],
  );
  const editDefaultValues = useMemo(
    () => (operation ? buildOperationEditDefaultValues(operation) : null),
    [operation],
  );

  if (!id) {
    return <ErrorState message={`${terminology.operation.singular} no encontrada.`} />;
  }

  if (operationQuery.isLoading) {
    return <LoadingState />;
  }

  if (operationQuery.isError || !operation) {
    return (
      <ErrorState
        message={getApiErrorMessage(
          operationQuery.error,
          `${terminology.operation.singular} no encontrada.`,
        )}
      />
    );
  }

  const canManage = hasPermission(permissionsQuery.data?.permissions, "operations:manage");
  const canViewAttendance = canAccessModuleRoute(
    modulesQuery.data,
    permissionsQuery.data?.permissions,
    "attendance",
  );
  const canAssign = canManage && isOperationAssignable(operation.status);
  const canEdit = canManage && isOperationEditable(operation.status);
  const canReactivate = canManage && isOperationReactivatable(operation.status);
  const serviceDisplayName = getOperationDisplayName(operation);
  const serviceDetailId = operation.serviceId || operation.service?.id;
  const serviceFieldValue = (
    <EntityLink
      entityType="service"
      entityId={serviceDetailId}
      label={serviceDisplayName}
    />
  );

  const geofenceSummary = operation.service?.allowedRadiusMeters
    ? `${operation.service.allowedRadiusMeters} m · tolerancias ${operation.earlyToleranceMinutes}/${operation.lateToleranceMinutes} min`
    : `Tolerancias ${operation.earlyToleranceMinutes}/${operation.lateToleranceMinutes} min`;

  const operationKindLabel = operationKindLabels[operation.operationKind ?? "ONE_TIME"];
  const scheduleMetric =
    operation.operationKind === "RECURRING"
      ? {
          title: "Vigencia",
          value: operation.schedule
            ? formatRecurringValidity(
                operation.schedule.validFrom,
                operation.schedule.validUntil,
              )
            : "—",
          description: operationKindLabel,
        }
      : {
          title: "Horario",
          value: formatDateTime(operation.scheduledStart),
          description: `Fin ${formatDateTime(operation.scheduledEnd)} · ${operationKindLabel}`,
        };

  const handleUpdate = async (values: OperationFormValues) => {
    setErrorMessage(null);

    try {
      await updateMutation.mutateAsync(toOperationUpdatePayload(operation, values));
      setEditing(false);
      showFeedback(`${terminology.operation.singular} actualizada correctamente.`);
    } catch (error) {
      if (isRecurringWorkdaySyncError(error)) {
        setEditing(false);
        showFeedback(getApiErrorMessage(error), "error");
        return;
      }
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync(id);
      setConfirmCancelOpen(false);
      showFeedback(`${terminology.operation.singular} cancelada.`);
    } catch (error) {
      showFeedback(getApiErrorMessage(error), "error");
    }
  };

  const handleReactivate = async () => {
    if (!id) {
      return;
    }
    try {
      await reactivateMutation.mutateAsync(id);
      setConfirmReactivateOpen(false);
      showFeedback("La operación fue reactivada correctamente.");
    } catch (error) {
      showFeedback(getApiErrorMessage(error), "error");
    }
  };

  const headerMenuItems: ActionMenuItem[] = [];
  if (canEdit && !editing) {
    headerMenuItems.push({
      key: "edit-page",
      label: "Editar",
      onClick: () => navigate(getEntityEditPath("operations", operation.id)),
    });
  }
  if (canEdit) {
    headerMenuItems.push({
      key: "toggle-edit",
      label: editing
        ? "Cancelar edición"
        : `Editar ${terminology.operation.singular.toLowerCase()}`,
      onClick: () => {
        setEditing((current) => !current);
        setErrorMessage(null);
      },
    });
    headerMenuItems.push({
      key: "cancel-operation",
      label: `Cancelar ${terminology.operation.singular.toLowerCase()}`,
      destructive: true,
      onClick: () => setConfirmCancelOpen(true),
    });
  }
  if (canReactivate) {
    headerMenuItems.push({
      key: "reactivate",
      label: "Reactivar operación",
      loading: reactivateMutation.isPending,
      disabled: reactivateMutation.isPending,
      onClick: () => setConfirmReactivateOpen(true),
    });
  }
  if (editing && canEdit) {
    headerMenuItems.push({
      key: "back",
      label: "Volver al listado",
      onClick: goBackToList,
    });
  }

  return (
    <>
      <PageHeader
        title={<EntityPageTitle name={serviceDisplayName} entityType="operation" />}
        description={`${`Detalle de la ${terminology.operation.singular.toLowerCase()}`} · ${formatOperationDetailScheduleTitle(operation)}`}
        action={
          <ActionMenu
            primary={
              editing && canEdit ? (
                <Button
                  type="submit"
                  form={OPERATION_DETAIL_FORM_ID}
                  loading={updateMutation.isPending}
                >
                  Guardar cambios
                </Button>
              ) : (
                <Group gap="sm" wrap="nowrap">
                  {canViewAttendance ? (
                    <Button
                      component={Link}
                      to={buildOperationAttendanceHref(operation.id)}
                      variant="filled"
                    >
                      Ver asistencias
                    </Button>
                  ) : null}
                  <Button variant="default" onClick={goBackToList}>
                    Volver al listado
                  </Button>
                </Group>
              )
            }
            items={headerMenuItems}
            menuLabel="Más acciones de la operación"
          />
        }
      />

      <Stack gap="lg">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 5 }} spacing="md">
          <MetricCard
            title="Estado"
            value={
              <StatusBadge
                label={operationStatusLabels[operation.status]}
                tone={operationStatusTone(operation.status)}
              />
            }
            description={operationKindLabel}
          />
          <MetricCard
            title={scheduleMetric.title}
            value={scheduleMetric.value}
            description={scheduleMetric.description}
          />
          <MetricCard
            title={terminology.service.singular}
            value={serviceFieldValue}
            description={operation.service?.address ?? "Sin dirección"}
          />
          <MetricCard
            title="Colaboradores asignados"
            value={operation.assignedEmployees.length}
            description="Dotación actual de la operación"
          />
          <MetricCard
            title="Asistencias registradas"
            value={operation.attendanceRecordsCount}
            description={geofenceSummary}
          />
        </SimpleGrid>

        <Box className={layoutClasses.operationDetailLayout}>
          <Box className={layoutClasses.operationalSection}>
            <OperationTeamSection
              operationId={operation.id}
              operationKind={operation.operationKind ?? "ONE_TIME"}
              canAssign={canAssign}
              operationWorkDate={operationWorkDate}
              operationalToday={operationalToday}
              workdayOptions={teamWorkdayOptions}
              selectedWorkday={teamWorkday}
              onWorkdayChange={setTeamWorkdayOverride}
              onFeedback={(message, severity) => showFeedback(message, severity)}
            />
          </Box>

          {editing && canEdit && editDefaultValues ? (
            <Box className={layoutClasses.editSection}>
              <SectionCard title={`Editar ${terminology.operation.singular.toLowerCase()}`}>
                <OperationForm
                  mode="edit"
                  currentStatus={operation.status}
                  currentOperationKind={operation.operationKind ?? "ONE_TIME"}
                  companyWorkSchedule={companyWorkScheduleQuery.data ?? null}
                  defaultValues={editDefaultValues}
                  submitLabel="Guardar cambios"
                  cancelTo={`/operations/${operation.id}`}
                  loading={updateMutation.isPending}
                  errorMessage={errorMessage}
                  onSubmit={handleUpdate}
                  embedded
                  formId={OPERATION_DETAIL_FORM_ID}
                  hideActions
                />
              </SectionCard>
            </Box>
          ) : null}
        </Box>
      </Stack>

      <ConfirmDialog
        open={confirmCancelOpen}
        title={`Cancelar ${terminology.operation.singular.toLowerCase()}`}
        description={`¿Confirmás cancelar esta ${terminology.operation.singular.toLowerCase()}? No podrá editarse luego.`}
        confirmLabel={`Cancelar ${terminology.operation.singular.toLowerCase()}`}
        destructive
        loading={cancelMutation.isPending}
        onCancel={() => setConfirmCancelOpen(false)}
        onConfirm={() => void handleCancel()}
      />

      <ConfirmDialog
        open={confirmReactivateOpen}
        title="Reactivar operación"
        description="¿Querés reactivar esta operación? Volverá a estar disponible para su gestión, pero no se reiniciarán automáticamente trabajos o procesamientos cancelados."
        confirmLabel="Reactivar operación"
        loading={reactivateMutation.isPending}
        onCancel={() => setConfirmReactivateOpen(false)}
        onConfirm={() => void handleReactivate()}
      />
    </>
  );
}
