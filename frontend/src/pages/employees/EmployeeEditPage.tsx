import { Group } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { EmployeeDeactivationDialog } from "../../components/employees/EmployeeDeactivationDialog";
import { EmployeeForm } from "../../components/employees/EmployeeForm";
import { EmployeeModuleQuickLinks } from "../../components/employees/EmployeeModuleQuickLinks";
import { EntityEditPageLayout } from "../../components/navigation/EntityEditPageLayout";
import { UnsavedChangesDialog } from "../../components/navigation/UnsavedChangesDialog";
import { EntityAvatar, ErrorState, LoadingState } from "../../design-system";
import {
  useDeactivateEmployee,
  useEmployee,
  useUpdateEmployee,
} from "../../hooks/useEmployees";
import { useUnsavedChangesController } from "../../hooks/useUnsavedChangesController";
import { getEmployeeDeactivationImpact } from "../../api/employees.api";
import type { EmployeeFormValues } from "../../schemas/employee.schema";
import type { EmployeeDeactivationImpact } from "../../types/employee-deactivation";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";
import { getEntityDetailPath } from "../../utils/entity-routes";

export function EmployeeEditPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const unsaved = useUnsavedChangesController({ active: true });
  const employeeQuery = useEmployee(id);
  const updateMutation = useUpdateEmployee(id ?? "");
  const deactivateMutation = useDeactivateEmployee(id ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deactivationImpact, setDeactivationImpact] = useState<EmployeeDeactivationImpact | null>(
    null,
  );
  const [pendingValues, setPendingValues] = useState<EmployeeFormValues | null>(null);
  const [deactivationError, setDeactivationError] = useState<string | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const confirmInFlight = useRef(false);

  if (!id) {
    return <ErrorState message={`${terminology.worker.singular} no encontrado.`} />;
  }

  if (employeeQuery.isLoading) {
    return <LoadingState />;
  }

  if (employeeQuery.isError || !employeeQuery.data) {
    return (
      <ErrorState
        message={getApiErrorMessage(
          employeeQuery.error,
          `${terminology.worker.singular} no encontrado.`,
        )}
      />
    );
  }

  const employee = employeeQuery.data;
  const formBusy =
    updateMutation.isPending || deactivateMutation.isPending || impactLoading;

  const goToDetail = () => {
    navigate(getEntityDetailPath("employees", id), { state: location.state });
  };

  const handleCancel = () => {
    unsaved.requestNavigation(goToDetail);
  };

  const finishSuccess = () => {
    unsaved.markClean();
    notifications.show({
      color: "green",
      message: `${terminology.worker.singular} actualizado correctamente.`,
    });
    goToDetail();
  };

  const buildProfilePayload = (values: EmployeeFormValues) => ({
    name: values.name,
    documentNumber: values.documentNumber?.trim() ? values.documentNumber.trim() : null,
    phoneNumber: values.phoneNumber,
    employeeType: values.employeeType,
    categoryId: values.categoryId ?? null,
    locationZoneId: values.locationZoneId ?? null,
  });

  const handleSubmit = async (values: EmployeeFormValues) => {
    setErrorMessage(null);
    unsaved.setSubmitting(true);

    const switchingToInactive = employee.active && !values.active;
    if (!switchingToInactive) {
      try {
        await updateMutation.mutateAsync({
          ...buildProfilePayload(values),
          active: values.active,
        });
        finishSuccess();
      } catch (error) {
        setErrorMessage(getApiErrorMessage(error));
      } finally {
        unsaved.setSubmitting(false);
      }
      return;
    }

    setImpactLoading(true);
    try {
      const impact = await getEmployeeDeactivationImpact(id);
      if (impact.canDeactivateDirectly) {
        await deactivateMutation.mutateAsync({
          confirmAffectedRelease: false,
          profile: buildProfilePayload(values),
        });
        finishSuccess();
        return;
      }

      setPendingValues(values);
      setDeactivationImpact(impact);
      setDeactivationError(null);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setImpactLoading(false);
      unsaved.setSubmitting(false);
    }
  };

  const handleConfirmDeactivation = async () => {
    if (!pendingValues || confirmInFlight.current) {
      return;
    }

    confirmInFlight.current = true;
    setDeactivationError(null);
    try {
      await deactivateMutation.mutateAsync({
        confirmAffectedRelease: true,
        profile: buildProfilePayload(pendingValues),
      });
      setDeactivationImpact(null);
      setPendingValues(null);
      finishSuccess();
    } catch (error) {
      setDeactivationError(getApiErrorMessage(error));
    } finally {
      confirmInFlight.current = false;
    }
  };

  const handleCancelDeactivation = () => {
    if (deactivateMutation.isPending) {
      return;
    }
    setDeactivationImpact(null);
    setPendingValues(null);
    setDeactivationError(null);
  };

  return (
    <EntityEditPageLayout
      title={
        <Group gap="md" wrap="nowrap" align="center">
          <EntityAvatar name={employee.name} entityType="collaborator" size="lg" />
          <span>{employee.name}</span>
        </Group>
      }
      description={`Editar ${terminology.worker.singular.toLowerCase()}`}
      action={<EmployeeModuleQuickLinks employeeId={employee.id} />}
    >
      <EmployeeForm
        defaultValues={{
          name: employee.name,
          documentNumber: employee.documentNumber ?? "",
          phoneNumber: employee.phoneNumber,
          employeeType: employee.employeeType,
          categoryId: employee.categoryId,
          locationZoneId: employee.locationZoneId,
          active: employee.active,
        }}
        retainedCategory={
          employee.category
            ? { id: employee.category.id, name: employee.category.name }
            : null
        }
        retainedLocationZone={
          employee.locationZone
            ? {
                id: employee.locationZone.id,
                name: employee.locationZone.name,
                locality: employee.locationZone.locality,
              }
            : null
        }
        submitLabel="Guardar cambios"
        cancelTo={getEntityDetailPath("employees", id)}
        onCancel={handleCancel}
        loading={formBusy}
        errorMessage={errorMessage}
        onDirtyChange={unsaved.setDirty}
        onSubmit={handleSubmit}
      />

      <EmployeeDeactivationDialog
        open={Boolean(deactivationImpact)}
        employeeName={employee.name}
        impact={deactivationImpact}
        loading={deactivateMutation.isPending}
        errorMessage={deactivationError}
        onConfirm={() => void handleConfirmDeactivation()}
        onCancel={handleCancelDeactivation}
      />
      <UnsavedChangesDialog
        open={unsaved.discardDialogOpen}
        onConfirm={unsaved.confirmDiscard}
        onCancel={unsaved.cancelDiscard}
      />
    </EntityEditPageLayout>
  );
}
