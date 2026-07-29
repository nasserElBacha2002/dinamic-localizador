import { Button, Group } from "@mantine/core";
import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { OperationForm } from "../../components/operations/OperationForm";
import { EntityEditPageLayout } from "../../components/navigation/EntityEditPageLayout";
import { EntityAvatar, ErrorState, LoadingState } from "../../design-system";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useCompanyWorkSchedule } from "../../hooks/useCompanyWorkSchedule";
import { useOperation, useUpdateOperation } from "../../hooks/useOperations";
import type { OperationFormValues } from "../../schemas/operation.schema";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage, isRecurringWorkdaySyncError } from "../../utils/errors";
import { getEntityDetailPath } from "../../utils/entity-routes";
import {
  buildOperationEditDefaultValues,
  toOperationUpdatePayload,
} from "../../utils/operation-detail-display";
import { getOperationDisplayName } from "../../utils/operation-display";
import { isOperationEditable } from "../../utils/operation-status";
import { hasPermission } from "../../utils/permissions";

/**
 * Phase 1 wrapper: dedicated `/operations/:id/edit` route reusing OperationForm.
 * Embedded edit toggle on OperationDetailPage remains until the operations migration phase.
 */
export function OperationEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const permissionsQuery = useCompanyPermissions();
  const canManage = hasPermission(permissionsQuery.data?.permissions, "operations:manage");
  const operationQuery = useOperation(id);
  const updateMutation = useUpdateOperation(id ?? "");
  const companyWorkScheduleQuery = useCompanyWorkSchedule(Boolean(operationQuery.data));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!id) {
    return <ErrorState message={`${terminology.operation.singular} no encontrada.`} />;
  }

  if (operationQuery.isLoading || permissionsQuery.isPending) {
    return <LoadingState message="Cargando operación..." />;
  }

  if (operationQuery.isError || !operationQuery.data) {
    return (
      <ErrorState
        message={getApiErrorMessage(
          operationQuery.error,
          `${terminology.operation.singular} no encontrada.`,
        )}
      />
    );
  }

  const operation = operationQuery.data;
  const displayName = getOperationDisplayName(operation);
  const canEdit = canManage && isOperationEditable(operation.status);

  const goToDetail = () => {
    navigate(getEntityDetailPath("operations", id), { state: location.state });
  };

  if (!canEdit) {
    return (
      <ErrorState
        message={`Esta ${terminology.operation.singular.toLowerCase()} no se puede editar en su estado actual.`}
        action={
          <Button variant="default" onClick={goToDetail}>
            Volver al detalle
          </Button>
        }
      />
    );
  }

  const handleSubmit = async (values: OperationFormValues) => {
    setErrorMessage(null);
    try {
      await updateMutation.mutateAsync(toOperationUpdatePayload(operation, values));
      goToDetail();
    } catch (error) {
      if (isRecurringWorkdaySyncError(error)) {
        setErrorMessage(getApiErrorMessage(error));
        return;
      }
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  return (
    <EntityEditPageLayout
      title={
        <Group gap="md" wrap="nowrap" align="center">
          <EntityAvatar name={displayName} entityType="operation" size="lg" />
          <span>{displayName}</span>
        </Group>
      }
      description={`Editar ${terminology.operation.singular.toLowerCase()}`}
      action={
        <Button variant="default" onClick={goToDetail}>
          Cancelar
        </Button>
      }
    >
      <OperationForm
        mode="edit"
        currentStatus={operation.status}
        currentOperationKind={operation.operationKind ?? "ONE_TIME"}
        companyWorkSchedule={companyWorkScheduleQuery.data ?? null}
        companyWorkScheduleLoading={companyWorkScheduleQuery.isPending}
        defaultValues={buildOperationEditDefaultValues(operation)}
        submitLabel="Guardar cambios"
        cancelTo={getEntityDetailPath("operations", id)}
        onCancel={goToDetail}
        loading={updateMutation.isPending}
        errorMessage={errorMessage}
        enableUnsavedGuard
        onSubmit={handleSubmit}
      />
    </EntityEditPageLayout>
  );
}
