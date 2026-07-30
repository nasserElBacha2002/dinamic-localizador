import { Button, Group, Stack } from "@mantine/core";
import { useParams } from "react-router";
import { EmployeeAbsenceBalanceCard } from "../../components/absences/EmployeeAbsenceBalanceCard";
import { EmployeeAbsenceHistoryTable } from "../../components/absences/EmployeeAbsenceHistoryTable";
import { EmployeeModuleQuickLinks } from "../../components/employees/EmployeeModuleQuickLinks";
import { EntityEditAction } from "../../components/navigation/EntityEditAction";
import {
  DetailFieldGrid,
  EntityAvatar,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "../../design-system";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useEmployee } from "../../hooks/useEmployees";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { terminology } from "../../domain/terminology";
import { safeText } from "../../utils/display-safe";
import { getApiErrorMessage } from "../../utils/errors";
import { activeStatusLabel, employeeTypeLabels } from "../../utils/labels";
import { hasPermission } from "../../utils/permissions";

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { goBackToList } = useListBackNavigation("/employees");
  const permissionsQuery = useCompanyPermissions();
  const canManage = hasPermission(permissionsQuery.data?.permissions, "employees:manage");
  const canUpdateBalance = hasPermission(
    permissionsQuery.data?.permissions,
    "absences:balance:update",
  );
  const employeeQuery = useEmployee(id);

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

  return (
    <Stack gap="md">
      <PageHeader
        title={
          <Group gap="md" wrap="nowrap" align="center">
            <EntityAvatar name={employee.name} entityType="collaborator" size="lg" />
            <span>{employee.name}</span>
          </Group>
        }
        description={`Detalle de ${terminology.worker.singular.toLowerCase()}`}
        action={
          <Group gap="sm">
            <EmployeeModuleQuickLinks employeeId={employee.id} />
            {canManage ? <EntityEditAction entity="employees" id={employee.id} /> : null}
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
        <EmployeeAbsenceBalanceCard
          employeeId={employee.id}
          year={currentYear}
          showEdit={canUpdateBalance}
        />
      </SectionCard>

      <SectionCard title={`Ausencias · Historial ${currentYear}`}>
        <EmployeeAbsenceHistoryTable employeeId={employee.id} year={currentYear} />
      </SectionCard>
    </Stack>
  );
}
