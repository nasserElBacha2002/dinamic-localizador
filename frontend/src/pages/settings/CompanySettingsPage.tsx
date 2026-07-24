import { Alert, Badge, Group, SimpleGrid, Stack } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { ErrorState, LoadingState, PageHeader } from "../../design-system";
import { useCompanyAbsenceSettings } from "../../hooks/useCompanyAbsenceSettings";
import { useCompanyLocationTypes } from "../../hooks/useCompanyLocationTypes";
import { useCompanySettings } from "../../hooks/useCompanySettings";
import { useCompanyWorkSchedule } from "../../hooks/useCompanyWorkSchedule";
import { useEmployeeCategories } from "../../hooks/useEmployeeCategories";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { companyRoleLabels } from "../../utils/labels";
import { getApiErrorMessage } from "../../utils/errors";
import {
  buildAbsenceSummary,
  buildEmployeeCategoriesSummary,
  buildLocationTypesSummary,
  buildOperationalSettingsSummary,
  buildWorkScheduleSummary,
} from "./company-settings-summaries";
import { CompanyAbsenceSettingsDialog } from "./components/CompanyAbsenceSettingsDialog";
import { CompanyLocationTypesDialog } from "./components/CompanyLocationTypesDialog";
import { CompanyOperationalSettingsDialog } from "./components/CompanyOperationalSettingsDialog";
import { CompanyWeeklyScheduleDialog } from "./components/CompanyWeeklyScheduleDialog";
import { EmployeeCategoriesDialog } from "./components/EmployeeCategoriesDialog";
import { SettingsSummaryCard } from "./components/SettingsSummaryCard";

type DialogKey =
  | "operational"
  | "absences"
  | "locationTypes"
  | "workSchedule"
  | "employeeCategories";

export function CompanySettingsPage() {
  const permissionsQuery = useCompanyPermissions();
  const canRead = permissionsQuery.data?.permissions.includes("company:read") ?? false;
  const canUpdate =
    permissionsQuery.data?.permissions.includes("company:settings:update") ?? false;

  const settingsQuery = useCompanySettings(canRead);
  const absenceSettingsQuery = useCompanyAbsenceSettings(canRead);
  const locationTypesQuery = useCompanyLocationTypes(false);
  const employeeCategoriesQuery = useEmployeeCategories({ includeInactive: true }, canRead);
  const workScheduleQuery = useCompanyWorkSchedule(canRead);

  const [openDialog, setOpenDialog] = useState<DialogKey | null>(null);

  const handleSaved = (message: string) => {
    notifications.show({ color: "green", message });
  };

  if (permissionsQuery.isPending) {
    return <LoadingState />;
  }

  if (!canRead) {
    return <ErrorState message="No tenés permisos para ver la configuración de esta empresa." />;
  }

  if (settingsQuery.isPending) {
    return <LoadingState />;
  }

  if (settingsQuery.isError || !settingsQuery.data) {
    return <ErrorState message={getApiErrorMessage(settingsQuery.error)} />;
  }

  const settings = settingsQuery.data;
  const operationalSummary = buildOperationalSettingsSummary(settings);

  return (
    <Stack gap="md">
      <PageHeader
        title="Configuración de empresa"
        description="Definí los parámetros operativos y administrativos de esta empresa."
        action={
          permissionsQuery.data ? (
            <Group gap="xs">
              <Badge variant="light">{permissionsQuery.data.companyName}</Badge>
              <Badge variant="outline">{companyRoleLabels[permissionsQuery.data.role]}</Badge>
            </Group>
          ) : null
        }
      />

      {!canUpdate ? (
        <Alert color="blue">No tenés permisos para editar esta configuración.</Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <SettingsSummaryCard
          title="Configuración operativa"
          description="Defaults usados por operaciones, importaciones y validaciones del bot."
          summaryItems={operationalSummary.summaryItems}
          actionLabel="Gestionar configuración operativa"
          canEdit={canUpdate}
          onAction={() => setOpenDialog("operational")}
        />

        <SettingsSummaryCard
          title="Horario laboral semanal"
          description="Horario predeterminado para operaciones habituales con horario de la empresa."
          summaryItems={
            workScheduleQuery.data
              ? buildWorkScheduleSummary(workScheduleQuery.data).summaryItems
              : []
          }
          loading={workScheduleQuery.isLoading}
          error={
            workScheduleQuery.isError ? getApiErrorMessage(workScheduleQuery.error) : null
          }
          onRetry={() => void workScheduleQuery.refetch()}
          actionLabel="Gestionar horario"
          canEdit={canUpdate && !workScheduleQuery.isError}
          onAction={() => setOpenDialog("workSchedule")}
        />

        <SettingsSummaryCard
          title="Ausencias"
          description="Saldos predeterminados para nuevos empleados."
          summaryItems={
            absenceSettingsQuery.data
              ? buildAbsenceSummary(absenceSettingsQuery.data).summaryItems
              : []
          }
          loading={absenceSettingsQuery.isLoading}
          error={
            absenceSettingsQuery.isError
              ? getApiErrorMessage(absenceSettingsQuery.error)
              : null
          }
          onRetry={() => void absenceSettingsQuery.refetch()}
          actionLabel="Gestionar ausencias"
          canEdit={canUpdate && !absenceSettingsQuery.isError}
          onAction={() => setOpenDialog("absences")}
        />

        <SettingsSummaryCard
          title="Formato"
          description="Clasificación de servicios, depósitos y otros puntos operativos."
          summaryItems={
            locationTypesQuery.data
              ? buildLocationTypesSummary(locationTypesQuery.data).summaryItems
              : []
          }
          chips={
            locationTypesQuery.data
              ? buildLocationTypesSummary(locationTypesQuery.data).chips
              : []
          }
          loading={locationTypesQuery.isLoading}
          error={
            locationTypesQuery.isError ? getApiErrorMessage(locationTypesQuery.error) : null
          }
          onRetry={() => void locationTypesQuery.refetch()}
          actionLabel="Gestionar formatos"
          canEdit={canUpdate && !locationTypesQuery.isError}
          onAction={() => setOpenDialog("locationTypes")}
        />

        <SettingsSummaryCard
          title="Categorías de colaboradores"
          description="Categorías laborales base y personalizadas para clasificar colaboradores."
          summaryItems={
            employeeCategoriesQuery.data
              ? buildEmployeeCategoriesSummary(employeeCategoriesQuery.data).summaryItems
              : []
          }
          chips={
            employeeCategoriesQuery.data
              ? buildEmployeeCategoriesSummary(employeeCategoriesQuery.data).chips
              : []
          }
          loading={employeeCategoriesQuery.isLoading}
          error={
            employeeCategoriesQuery.isError
              ? getApiErrorMessage(employeeCategoriesQuery.error)
              : null
          }
          onRetry={() => void employeeCategoriesQuery.refetch()}
          actionLabel="Gestionar categorías"
          canEdit={canUpdate && !employeeCategoriesQuery.isError}
          onAction={() => setOpenDialog("employeeCategories")}
        />
      </SimpleGrid>

      {openDialog === "operational" ? (
        <CompanyOperationalSettingsDialog
          key={`operational-${settings.companyId}-${settings.updatedAt}`}
          opened
          onClose={() => setOpenDialog(null)}
          settings={settings}
          canUpdate={canUpdate}
          onSaved={handleSaved}
        />
      ) : null}

      {openDialog === "absences" && absenceSettingsQuery.data ? (
        <CompanyAbsenceSettingsDialog
          opened
          onClose={() => setOpenDialog(null)}
          settings={absenceSettingsQuery.data}
          canUpdate={canUpdate}
          onSaved={handleSaved}
        />
      ) : null}

      {openDialog === "locationTypes" && locationTypesQuery.data ? (
        <CompanyLocationTypesDialog
          opened
          onClose={() => setOpenDialog(null)}
          locationTypes={locationTypesQuery.data}
          canUpdate={canUpdate}
        />
      ) : null}

      {openDialog === "employeeCategories" && employeeCategoriesQuery.data ? (
        <EmployeeCategoriesDialog
          opened
          onClose={() => setOpenDialog(null)}
          categories={employeeCategoriesQuery.data}
          canUpdate={canUpdate}
        />
      ) : null}

      {openDialog === "workSchedule" && workScheduleQuery.data ? (
        <CompanyWeeklyScheduleDialog
          opened
          onClose={() => setOpenDialog(null)}
          schedule={workScheduleQuery.data}
          canUpdate={canUpdate}
          onSaved={handleSaved}
        />
      ) : null}
    </Stack>
  );
}
