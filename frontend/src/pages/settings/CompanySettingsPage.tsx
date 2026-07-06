import { Alert, Badge, Group, SimpleGrid, Stack } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { ErrorState, LoadingState, PageHeader } from "../../design-system";
import { useCompanyAbsenceSettings } from "../../hooks/useCompanyAbsenceSettings";
import { useCompanyLocationTypes } from "../../hooks/useCompanyLocationTypes";
import { useCompanySettings } from "../../hooks/useCompanySettings";
import { useCompanyWorkSchedule } from "../../hooks/useCompanyWorkSchedule";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { companyRoleLabels } from "../../utils/labels";
import { getApiErrorMessage } from "../../utils/errors";
import { buildAbsenceSummary, buildLocationTypesSummary, buildWorkScheduleSummary } from "./company-settings-summaries";
import { CompanyAbsenceSettingsDialog } from "./components/CompanyAbsenceSettingsDialog";
import { CompanyLocationTypesDialog } from "./components/CompanyLocationTypesDialog";
import { CompanyOperationalSettingsSection } from "./components/CompanyOperationalSettingsSection";
import { CompanyWeeklyScheduleDialog } from "./components/CompanyWeeklyScheduleDialog";
import { SettingsSummaryCard } from "./components/SettingsSummaryCard";

type DialogKey = "absences" | "locationTypes" | "workSchedule";

export function CompanySettingsPage() {
  const permissionsQuery = useCompanyPermissions();
  const canRead = permissionsQuery.data?.permissions.includes("company:read") ?? false;
  const canUpdate =
    permissionsQuery.data?.permissions.includes("company:settings:update") ?? false;

  const settingsQuery = useCompanySettings(canRead);
  const absenceSettingsQuery = useCompanyAbsenceSettings(canRead);
  const locationTypesQuery = useCompanyLocationTypes(false);
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

      <CompanyOperationalSettingsSection
        key={`operational-${settings.companyId}-${settings.updatedAt}`}
        settings={settings}
        canUpdate={canUpdate}
        onSaved={handleSaved}
      />

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
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
          title="Tipos de ubicación / servicio"
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
          actionLabel="Gestionar tipos"
          canEdit={canUpdate && !locationTypesQuery.isError}
          onAction={() => setOpenDialog("locationTypes")}
        />
      </SimpleGrid>

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
