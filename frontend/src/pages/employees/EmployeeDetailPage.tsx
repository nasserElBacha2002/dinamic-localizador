import { Button, Stack } from "@mantine/core";
import { useNavigate, useParams } from "react-router";
import { EmployeeAbsenceBalanceCard } from "../../components/absences/EmployeeAbsenceBalanceCard";
import { EmployeeAbsenceHistoryTable } from "../../components/absences/EmployeeAbsenceHistoryTable";
import { EmployeeOperationalAvailabilityCard } from "../../components/employees/EmployeeOperationalAvailabilityCard";
import { EntityEditAction } from "../../components/navigation/EntityEditAction";
import {
  ActionMenu,
  DetailFieldGrid,
  EntityPageTitle,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
  StatusBadge,
  type ActionMenuItem,
} from "../../design-system";
import { useCompanyModules } from "../../hooks/useCompanyModules";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useEmployee } from "../../hooks/useEmployees";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { terminology } from "../../domain/terminology";
import { safeText } from "../../utils/display-safe";
import { filterEmployeeModuleQuickLinks } from "../../utils/employee-module-quick-links";
import { getApiErrorMessage } from "../../utils/errors";
import { activeStatusLabel, employeeTypeLabels } from "../../utils/labels";
import { hasPermission } from "../../utils/permissions";

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { goBackToList } = useListBackNavigation("/employees");
  const permissionsQuery = useCompanyPermissions();
  const modulesQuery = useCompanyModules();
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

  // Module quick-links are best-effort: never block the detail page on modules load/error.
  const moduleLinks =
    !modulesQuery.isPending && !modulesQuery.isError && modulesQuery.data
      ? filterEmployeeModuleQuickLinks(
          employee.id,
          modulesQuery.data,
          permissionsQuery.data?.permissions,
        )
      : [];

  const secondaryItems: ActionMenuItem[] = [
    ...moduleLinks.map((link) => ({
      key: link.accessKey,
      label: link.label,
      onClick: () => navigate(link.to),
    })),
    {
      key: "back",
      label: "Volver al listado",
      onClick: goBackToList,
    },
  ];

  return (
    <Stack gap="md">
      <PageHeader
        title={<EntityPageTitle name={employee.name} entityType="collaborator" />}
        description={`Detalle de ${terminology.worker.singular.toLowerCase()}`}
        action={
          <ActionMenu
            primary={
              canManage ? (
                <EntityEditAction entity="employees" id={employee.id} />
              ) : (
                <Button variant="default" onClick={goBackToList}>
                  Volver al listado
                </Button>
              )
            }
            items={
              canManage
                ? secondaryItems
                : moduleLinks.map((link) => ({
                    key: link.accessKey,
                    label: link.label,
                    onClick: () => navigate(link.to),
                  }))
            }
            menuLabel={`Más acciones del ${terminology.worker.singular.toLowerCase()}`}
          />
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

      <SectionCard title="Disponibilidad operacional">
        <EmployeeOperationalAvailabilityCard employeeId={employee.id} />
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
