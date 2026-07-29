import { Button, Group, Stack } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { EmployeeAbsenceBalanceCard } from "../../components/absences/EmployeeAbsenceBalanceCard";
import { EmployeeAbsenceHistoryTable } from "../../components/absences/EmployeeAbsenceHistoryTable";
import { EmployeeDeactivationDialog } from "../../components/employees/EmployeeDeactivationDialog";
import { EmployeeForm } from "../../components/employees/EmployeeForm";
import { EmployeeModuleQuickLinks } from "../../components/employees/EmployeeModuleQuickLinks";
import { EntityEditPageLayout } from "../../components/navigation/EntityEditPageLayout";
import {
  DetailFieldGrid,
  EntityAvatar,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "../../design-system";
import {
  useDeactivateEmployee,
  useEmployee,
  useUpdateEmployee,
} from "../../hooks/useEmployees";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { getEmployeeDeactivationImpact } from "../../api/employees.api";
import type { EmployeeFormValues } from "../../schemas/employee.schema";
import type { EmployeeDeactivationImpact } from "../../types/employee-deactivation";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";
import { getEntityDetailPath, isEntityEditPath } from "../../utils/entity-routes";
import { activeStatusLabel, employeeTypeLabels } from "../../utils/labels";
import { hasPermission } from "../../utils/permissions";
import { safeText } from "../../utils/display-safe";

export function EmployeeEditPage() {
  const { goBackToList } = useListBackNavigation("/employees");
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const onEditRoute = isEntityEditPath(location.pathname, "employees");
  const permissionsQuery = useCompanyPermissions();
  const canManage = hasPermission(permissionsQuery.data?.permissions, "employees:manage");
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

  if (employeeQuery.isLoading || permissionsQuery.isPending) {
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
  const currentYear = new Date().getFullYear();
  const formBusy =
    updateMutation.isPending || deactivateMutation.isPending || impactLoading;

  const goToDetail = () => {
    navigate(getEntityDetailPath("employees", id), { state: location.state });
  };

  const handleCancel = () => {
    if (onEditRoute) {
      goToDetail();
      return;
    }
    goBackToList();
  };

  const finishSuccess = () => {
    notifications.show({
      color: "green",
      message: `${terminology.worker.singular} actualizado correctamente.`,
    });
    if (onEditRoute) {
      goToDetail();
      return;
    }
    goBackToList();
  };

  const buildProfilePayload = (values: EmployeeFormValues) => ({
    name: values.name,
    documentNumber: values.documentNumber?.trim() ? values.documentNumber.trim() : null,
    phoneNumber: values.phoneNumber,
    employeeType: values.employeeType,
    categoryId: values.categoryId ?? null,
  });

  const handleSubmit = async (values: EmployeeFormValues) => {
    setErrorMessage(null);

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

  // Phase 1: until EmployeeDetailPage exists, read-only users get a safe consultation view.
  if (!canManage) {
    return (
      <Stack gap="md">
        <PageHeader
          title={
            <Group gap="md" wrap="nowrap" align="center">
              <EntityAvatar name={employee.name} entityType="collaborator" size="lg" />
              <span>{employee.name}</span>
            </Group>
          }
          description={`Consulta de ${terminology.worker.singular.toLowerCase()}`}
          action={
            <Group gap="sm">
              <EmployeeModuleQuickLinks employeeId={employee.id} />
              <Button variant="default" onClick={goBackToList}>
                Volver al listado
              </Button>
            </Group>
          }
        />
        <SectionCard title="Información general">
          <DetailFieldGrid
            fields={[
              { label: "Nombre", value: employee.name },
              { label: "Documento", value: safeText(employee.documentNumber) },
              { label: "Teléfono", value: employee.phoneNumber },
              {
                label: `Tipo de ${terminology.worker.singular.toLowerCase()}`,
                value: employeeTypeLabels[employee.employeeType],
              },
              { label: "Categoría", value: safeText(employee.category?.name ?? null) },
              {
                label: "Estado",
                value: (
                  <StatusBadge
                    label={activeStatusLabel(employee.active)}
                    tone={employee.active ? "success" : "neutral"}
                  />
                ),
              },
            ]}
          />
        </SectionCard>
        <SectionCard title={`Ausencias · Saldos ${currentYear}`}>
          <EmployeeAbsenceBalanceCard employeeId={employee.id} year={currentYear} showEdit={false} />
        </SectionCard>
        <SectionCard title={`Ausencias · Historial ${currentYear}`}>
          <EmployeeAbsenceHistoryTable employeeId={employee.id} year={currentYear} />
        </SectionCard>
      </Stack>
    );
  }

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
          active: employee.active,
        }}
        retainedCategory={
          employee.category
            ? { id: employee.category.id, name: employee.category.name }
            : null
        }
        submitLabel="Guardar cambios"
        cancelTo="/employees"
        onCancel={handleCancel}
        loading={formBusy}
        errorMessage={errorMessage}
        enableUnsavedGuard={onEditRoute}
        onSubmit={handleSubmit}
      />
      <SectionCard title={`Ausencias · Saldos ${currentYear}`}>
        <EmployeeAbsenceBalanceCard employeeId={employee.id} year={currentYear} />
      </SectionCard>
      <SectionCard title={`Ausencias · Historial ${currentYear}`}>
        <EmployeeAbsenceHistoryTable employeeId={employee.id} year={currentYear} />
      </SectionCard>

      <EmployeeDeactivationDialog
        open={Boolean(deactivationImpact)}
        employeeName={employee.name}
        impact={deactivationImpact}
        loading={deactivateMutation.isPending}
        errorMessage={deactivationError}
        onConfirm={() => void handleConfirmDeactivation()}
        onCancel={handleCancelDeactivation}
      />
    </EntityEditPageLayout>
  );
}
