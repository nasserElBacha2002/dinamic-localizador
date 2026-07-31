import { Button, Group } from "@mantine/core";
import { useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { OperationForm } from "../../components/operations/OperationForm";
import { EntityEditPageLayout } from "../../components/navigation/EntityEditPageLayout";
import { UnsavedChangesDialog } from "../../components/navigation/UnsavedChangesDialog";
import { ConfirmDialog, EntityAvatar, ErrorState, LoadingState } from "../../design-system";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useCompanyWorkSchedule } from "../../hooks/useCompanyWorkSchedule";
import { useUnsavedChangesController } from "../../hooks/useUnsavedChangesController";
import { useOperation, useUpdateOperation } from "../../hooks/useOperations";
import type { OperationFormValues } from "../../schemas/operation.schema";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";
import { getEntityDetailPath } from "../../utils/entity-routes";
import { doesOperationUpdateResetConfirmations } from "../../utils/operation-confirmation-reset";
import {
  buildOperationEditDefaultValues,
  toOperationUpdatePayload,
} from "../../utils/operation-detail-display";
import { getOperationDisplayName } from "../../utils/operation-display";
import { isOperationEditable } from "../../utils/operation-status";
import { hasPermission } from "../../utils/permissions";

/**
 * Dedicated `/operations/:id/edit` route reusing OperationForm.
 * Embedded edit on OperationDetailPage remains until the operations migration phase.
 */
export function OperationEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const unsaved = useUnsavedChangesController({ active: true });
  const permissionsQuery = useCompanyPermissions();
  const canManage = hasPermission(permissionsQuery.data?.permissions, "operations:manage");
  const operationQuery = useOperation(id);
  const updateMutation = useUpdateOperation(id ?? "");
  const companyWorkScheduleQuery = useCompanyWorkSchedule(Boolean(operationQuery.data));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingValues, setPendingValues] = useState<OperationFormValues | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const submitInFlight = useRef(false);

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

  const handleCancel = () => {
    unsaved.requestNavigation(goToDetail);
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

  const runUpdate = async (values: OperationFormValues) => {
    if (submitInFlight.current) {
      return;
    }
    submitInFlight.current = true;
    setErrorMessage(null);
    unsaved.setSubmitting(true);
    try {
      await updateMutation.mutateAsync(toOperationUpdatePayload(operation, values));
      unsaved.markClean();
      setResetConfirmOpen(false);
      setPendingValues(null);
      goToDetail();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      unsaved.setSubmitting(false);
      submitInFlight.current = false;
    }
  };

  const handleSubmit = async (values: OperationFormValues) => {
    if (doesOperationUpdateResetConfirmations(operation, values)) {
      setPendingValues(values);
      setResetConfirmOpen(true);
      return;
    }
    await runUpdate(values);
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
        <Button variant="default" onClick={handleCancel}>
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
        onCancel={handleCancel}
        loading={updateMutation.isPending}
        errorMessage={errorMessage}
        onDirtyChange={unsaved.setDirty}
        onSubmit={handleSubmit}
      />
      <ConfirmDialog
        open={resetConfirmOpen}
        title="Restablecer confirmaciones"
        description="Cambiar la programación restablecerá las confirmaciones del equipo. Los colaboradores deberán confirmar nuevamente su participación. ¿Querés guardar los cambios?"
        confirmLabel="Guardar y restablecer"
        cancelLabel="Continuar editando"
        destructive
        loading={updateMutation.isPending}
        onConfirm={() => {
          if (pendingValues) {
            void runUpdate(pendingValues);
          }
        }}
        onCancel={() => {
          if (updateMutation.isPending) {
            return;
          }
          setResetConfirmOpen(false);
          setPendingValues(null);
        }}
      />
      <UnsavedChangesDialog
        open={unsaved.discardDialogOpen}
        onConfirm={unsaved.confirmDiscard}
        onCancel={unsaved.cancelDiscard}
      />
    </EntityEditPageLayout>
  );
}
