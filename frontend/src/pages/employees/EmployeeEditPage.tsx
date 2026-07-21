import { notifications } from "@mantine/notifications";
import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Stack } from "@mantine/core";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { EmployeeAbsenceBalanceCard } from "../../components/absences/EmployeeAbsenceBalanceCard";
import { EmployeeAbsenceHistoryTable } from "../../components/absences/EmployeeAbsenceHistoryTable";
import { EmployeeDeactivationDialog } from "../../components/employees/EmployeeDeactivationDialog";
import { EmployeeForm } from "../../components/employees/EmployeeForm";
import { ErrorState, LoadingState, PageHeader, SectionCard } from "../../design-system";
import {
  useDeactivateEmployee,
  useEmployee,
  useUpdateEmployee,
} from "../../hooks/useEmployees";
import { getEmployeeDeactivationImpact } from "../../api/employees.api";
import type { EmployeeFormValues } from "../../schemas/employee.schema";
import type { EmployeeDeactivationImpact } from "../../types/employee-deactivation";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";

export function EmployeeEditPage() {
  const { goBackToList } = useListBackNavigation("/employees");
  const { id } = useParams<{ id: string }>();
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
  const currentYear = new Date().getFullYear();
  const formBusy =
    updateMutation.isPending || deactivateMutation.isPending || impactLoading;

  const buildProfilePayload = (values: EmployeeFormValues) => ({
    name: values.name,
    documentNumber: values.documentNumber?.trim() ? values.documentNumber.trim() : null,
    phoneNumber: values.phoneNumber,
    employeeType: values.employeeType,
    categoryId: values.categoryId ?? null,
  });

  const finishSuccess = () => {
    notifications.show({
      color: "green",
      message: `${terminology.worker.singular} actualizado correctamente.`,
    });
    goBackToList();
  };

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

  return (
    <Stack gap="md">
      <PageHeader
        title={`Editar ${terminology.worker.singular.toLowerCase()}`}
        description={employee.name}
      />
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
        onCancel={goBackToList}
        loading={formBusy}
        errorMessage={errorMessage}
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
    </Stack>
  );
}
