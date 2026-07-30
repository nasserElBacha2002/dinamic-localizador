import { Alert, Badge, Group, SimpleGrid, Stack, Switch, Tabs, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { ErrorState, LoadingState, PageHeader } from "../../design-system";
import { useAbsenceAttachmentStorageHealth } from "../../hooks/useAbsenceAttachments";
import { useCompanyAbsenceSettings } from "../../hooks/useCompanyAbsenceSettings";
import { useCompanyLocationTypes } from "../../hooks/useCompanyLocationTypes";
import { useCompanySettings, useUpdateCompanySettings } from "../../hooks/useCompanySettings";
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
import { CompanyAbsenceCalendarDialog } from "./components/CompanyAbsenceCalendarDialog";
import { CompanyAbsenceSettingsDialog } from "./components/CompanyAbsenceSettingsDialog";
import { CompanyAbsenceTypePolicyDialog } from "./components/CompanyAbsenceTypePolicyDialog";
import { CompanyLocationTypesDialog } from "./components/CompanyLocationTypesDialog";
import { CompanyOperationalSettingsDialog } from "./components/CompanyOperationalSettingsDialog";
import { CompanyWeeklyScheduleDialog } from "./components/CompanyWeeklyScheduleDialog";
import { EmployeeCategoriesDialog } from "./components/EmployeeCategoriesDialog";
import { SettingsSummaryCard } from "./components/SettingsSummaryCard";
import { useDefaultAbsenceCalendar } from "../../hooks/useAbsenceCalendar";
import { useOperationalQueryEnabled } from "../../hooks/useOperationalQueryEnabled";
import { useQueryClient } from "@tanstack/react-query";
import { absenceAttachmentKeys } from "../../api/absence-query-keys";

type SettingsTab = "company" | "absences";

type DialogKey =
  | "operational"
  | "absences"
  | "absenceTypePolicy"
  | "absenceCalendar"
  | "locationTypes"
  | "workSchedule"
  | "employeeCategories";

const parseTab = (value: string | null): SettingsTab =>
  value === "absences" ? "absences" : "company";

export function CompanySettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseTab(searchParams.get("tab"));
  const { companyId: activeCompanyId } = useOperationalQueryEnabled();

  const permissionsQuery = useCompanyPermissions();
  const canRead = permissionsQuery.data?.permissions.includes("company:read") ?? false;
  const canUpdate =
    permissionsQuery.data?.permissions.includes("company:settings:update") ?? false;

  const companyTabEnabled = canRead && activeTab === "company";
  const absencesTabEnabled = canRead && activeTab === "absences";

  const settingsQuery = useCompanySettings(companyTabEnabled || absencesTabEnabled);
  const workScheduleQuery = useCompanyWorkSchedule(companyTabEnabled);
  const locationTypesQuery = useCompanyLocationTypes(false);
  const employeeCategoriesQuery = useEmployeeCategories(
    { includeInactive: true },
    companyTabEnabled,
  );

  const absenceSettingsQuery = useCompanyAbsenceSettings(absencesTabEnabled);
  const absenceCalendarQuery = useDefaultAbsenceCalendar(absencesTabEnabled);
  const storageHealthQuery = useAbsenceAttachmentStorageHealth(
    absencesTabEnabled && canUpdate,
  );
  const updateSettingsMutation = useUpdateCompanySettings();
  const queryClient = useQueryClient();

  const [openDialog, setOpenDialog] = useState<DialogKey | null>(null);
  const [dialogCompanyId, setDialogCompanyId] = useState(activeCompanyId);

  if (dialogCompanyId !== activeCompanyId) {
    setDialogCompanyId(activeCompanyId);
    if (openDialog !== null) {
      setOpenDialog(null);
    }
  }

  useEffect(() => {
    if (!searchParams.get("tab")) {
      setSearchParams({ tab: "company" }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleSaved = (message: string) => {
    notifications.show({ color: "green", message });
  };

  const handleAttachmentsToggle = async (checked: boolean) => {
    if (!canUpdate || updateSettingsMutation.isPending) {
      return;
    }
    try {
      await updateSettingsMutation.mutateAsync({ absenceAttachmentsEnabled: checked });
      void queryClient.invalidateQueries({
        queryKey: absenceAttachmentKeys.storageHealth(activeCompanyId),
      });
      handleSaved(
        checked
          ? "Adjuntos de ausencias habilitados."
          : "Adjuntos de ausencias deshabilitados.",
      );
    } catch (error) {
      notifications.show({ color: "red", message: getApiErrorMessage(error) });
    }
  };

  const setTab = (tab: SettingsTab) => {
    setSearchParams({ tab }, { replace: true });
  };

  const operationalSummary = useMemo(
    () => (settingsQuery.data ? buildOperationalSettingsSummary(settingsQuery.data) : null),
    [settingsQuery.data],
  );

  if (permissionsQuery.isPending) {
    return <LoadingState />;
  }

  if (!canRead) {
    return <ErrorState message="No tenés permisos para ver la configuración de esta empresa." />;
  }

  if (companyTabEnabled && settingsQuery.isPending) {
    return <LoadingState />;
  }

  if (companyTabEnabled && (settingsQuery.isError || !settingsQuery.data)) {
    return <ErrorState message={getApiErrorMessage(settingsQuery.error)} />;
  }

  return (
    <Stack gap="md">
      <PageHeader
        title="Configuración"
        description="Parámetros operativos de la empresa y políticas de ausencias."
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

      <Tabs
        value={activeTab}
        onChange={(value) => setTab(parseTab(value))}
        keepMounted={false}
      >
        <Tabs.List>
          <Tabs.Tab value="company" aria-selected={activeTab === "company"}>
            Empresa
          </Tabs.Tab>
          <Tabs.Tab value="absences" aria-selected={activeTab === "absences"}>
            Ausencias
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="company" pt="md">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <SettingsSummaryCard
              title="Configuración operativa"
              description="Defaults usados por operaciones, importaciones y validaciones del bot."
              summaryItems={operationalSummary?.summaryItems ?? []}
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
        </Tabs.Panel>

        <Tabs.Panel value="absences" pt="md">
          {absencesTabEnabled && absenceSettingsQuery.isPending ? <LoadingState /> : null}
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <SettingsSummaryCard
              title="Configuración base de ausencias"
              description="Saldos predeterminados para nuevos empleados e información general del módulo."
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
              title="Políticas por tipo"
              description="Días corridos o hábiles, calendario aplicable y política de adjuntos por tipo."
              summaryItems={[
                {
                  label: "Tipos",
                  value: "Configurá el modo de conteo y adjuntos sin SQL",
                },
              ]}
              actionLabel="Gestionar políticas"
              canEdit={canUpdate}
              onAction={() => setOpenDialog("absenceTypePolicy")}
            />

            <SettingsSummaryCard
              title="Calendarios, feriados y excepciones"
              description="Días laborables, feriados y excepciones para el cálculo de duración. Incluye activación de calendario avanzado."
              summaryItems={
                absenceCalendarQuery.data
                  ? [
                      {
                        label: "Calendario",
                        value: absenceCalendarQuery.data.name,
                      },
                      {
                        label: "Zona horaria",
                        value: absenceCalendarQuery.data.timezone,
                      },
                      {
                        label: "Días laborables",
                        value: String(
                          absenceCalendarQuery.data.weekdays.filter((day) => day.isWorkingDay)
                            .length,
                        ),
                      },
                    ]
                  : []
              }
              loading={absenceCalendarQuery.isLoading}
              error={
                absenceCalendarQuery.isError
                  ? getApiErrorMessage(absenceCalendarQuery.error)
                  : null
              }
              onRetry={() => void absenceCalendarQuery.refetch()}
              actionLabel="Gestionar calendario"
              canEdit={canUpdate && !absenceCalendarQuery.isError}
              onAction={() => setOpenDialog("absenceCalendar")}
            />

            {canUpdate ? (
              <SettingsSummaryCard
                title="Documentación adjunta"
                description="Almacenamiento de archivos adjuntos en solicitudes de ausencia (PDF e imágenes)."
                summaryItems={
                  storageHealthQuery.data
                    ? [
                        {
                          label: "Módulo",
                          value: storageHealthQuery.data.featureEnabled
                            ? "Habilitado"
                            : "Deshabilitado",
                        },
                        {
                          label: "Almacenamiento",
                          value: storageHealthQuery.data.storageConfigured
                            ? storageHealthQuery.data.storageAvailable
                              ? "Disponible"
                              : "No disponible"
                            : "No configurado",
                        },
                        ...(storageHealthQuery.data.message
                          ? [
                              {
                                label: "Detalle",
                                value: storageHealthQuery.data.message,
                              },
                            ]
                          : []),
                      ]
                    : []
                }
                loading={storageHealthQuery.isLoading}
                error={
                  storageHealthQuery.isError
                    ? getApiErrorMessage(storageHealthQuery.error)
                    : null
                }
                onRetry={() => void storageHealthQuery.refetch()}
                footer={
                  <Stack gap="xs">
                    <Switch
                      label="Habilitar adjuntos de ausencias"
                      checked={Boolean(
                        settingsQuery.data?.absenceAttachmentsEnabled ??
                          storageHealthQuery.data?.featureEnabled,
                      )}
                      disabled={updateSettingsMutation.isPending || !settingsQuery.data}
                      onChange={(event) =>
                        void handleAttachmentsToggle(event.currentTarget.checked)
                      }
                    />
                    {!storageHealthQuery.data?.storageConfigured ||
                    !storageHealthQuery.data?.storageAvailable ? (
                      <Text size="xs" c="dimmed">
                        El almacenamiento debe estar configurado en el servidor para poder
                        subir archivos.
                      </Text>
                    ) : null}
                  </Stack>
                }
              />
            ) : null}

            <Alert color="gray">
              Los saldos individuales de colaboradores se gestionan en la ficha del empleado, no
              en configuración. El ledger de saldos se activa por empresa con un proceso administrativo
              explícito.
            </Alert>
          </SimpleGrid>
        </Tabs.Panel>
      </Tabs>

      {openDialog === "operational" && settingsQuery.data ? (
        <CompanyOperationalSettingsDialog
          key={`operational-${settingsQuery.data.companyId}-${settingsQuery.data.updatedAt}`}
          opened
          onClose={() => setOpenDialog(null)}
          settings={settingsQuery.data}
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

      {openDialog === "absenceTypePolicy" ? (
        <CompanyAbsenceTypePolicyDialog
          opened
          onClose={() => setOpenDialog(null)}
          canUpdate={canUpdate}
          onSaved={handleSaved}
        />
      ) : null}

      {openDialog === "absenceCalendar" ? (
        <CompanyAbsenceCalendarDialog
          opened
          onClose={() => setOpenDialog(null)}
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
