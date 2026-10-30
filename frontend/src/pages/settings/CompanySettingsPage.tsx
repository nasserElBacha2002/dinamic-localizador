import { Alert, Group, SimpleGrid, Stack, Tabs } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { ErrorState, LoadingState, PageHeader, StatusBadge } from "../../design-system";
import { useAbsenceAttachmentStorageHealth } from "../../hooks/useAbsenceAttachments";
import { useCompanyAbsenceSettings } from "../../hooks/useCompanyAbsenceSettings";
import { useCompanySettings } from "../../hooks/useCompanySettings";
import { useCompanyWorkSchedule } from "../../hooks/useCompanyWorkSchedule";
import { useEmployeeCategories } from "../../hooks/useEmployeeCategories";
import { useLocationZones } from "../../hooks/useLocationZones";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useAuth } from "../../hooks/useAuth";
import { companyRoleLabels } from "../../utils/labels";
import { getApiErrorMessage } from "../../utils/errors";
import { hasPermission } from "../../utils/permissions";
import {
  buildEmployeeCategoriesSummary,
  buildLocationZonesSummary,
  buildOperationalAndWorkScheduleCardSummary,
} from "./company-settings-summaries";
import { CompanyWhatsAppAlertsDialog } from "./components/whatsapp/CompanyWhatsAppAlertsDialog";
import { CompanyWhatsAppQuotaSettingsDialog } from "./components/whatsapp/CompanyWhatsAppQuotaSettingsDialog";
import {
  useCompanyAlertRecipients,
} from "../../hooks/useCompanyAlertRecipients";
import { useWhatsAppQuotaSettings } from "../../hooks/useWhatsAppQuotaSettings";
import { CompanyAbsenceCalendarDialog } from "./components/absence/CompanyAbsenceCalendarDialog";
import { CompanyAbsenceOperationalIntegrationDialog } from "./components/absence/CompanyAbsenceOperationalIntegrationDialog";
import { CompanyAbsenceSettingsDialog } from "./components/absence/CompanyAbsenceSettingsDialog";
import { CompanyAbsenceSettingsTabPanel } from "./components/absence/CompanyAbsenceSettingsTabPanel";
import { CompanyAbsenceTypePolicyDialog } from "./components/absence/CompanyAbsenceTypePolicyDialog";
import { CompanyOperationalAndWorkScheduleDialog } from "./components/schedule/CompanyOperationalAndWorkScheduleDialog";
import { CompanyShiftTemplatesDialog } from "./components/schedule/CompanyShiftTemplatesDialog";
import { EmployeeCategoriesDialog } from "./components/employees/EmployeeCategoriesDialog";
import { LocationZonesDialog } from "./components/locations/LocationZonesDialog";
import { SettingsSummaryCard } from "./components/SettingsSummaryCard";
import pageClasses from "./settings-visual.module.css";
import { useDefaultAbsenceCalendar } from "../../hooks/useAbsenceCalendar";
import { useOperationalQueryEnabled } from "../../hooks/useOperationalQueryEnabled";
import { useShiftTemplates } from "../../hooks/useShiftTemplates";
import { isOvernightShift } from "../../utils/operation-shift-payload";

type SettingsTab = "company" | "absences";

type DialogKey =
  | "operationalWorkSchedule"
  | "absences"
  | "absenceTypePolicy"
  | "absenceCalendar"
  | "absenceOperationalIntegration"
  | "shiftTemplates"
  | "employeeCategories"
  | "locationZones"
  | "whatsappAlerts"
  | "whatsappQuotas";

const parseTab = (value: string | null): SettingsTab =>
  value === "absences" ? "absences" : "company";

export function CompanySettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseTab(searchParams.get("tab"));
  const { companyId: activeCompanyId } = useOperationalQueryEnabled();
  const { user } = useAuth();
  const isPlatformAdmin = Boolean(user?.isPlatformAdmin);

  const permissionsQuery = useCompanyPermissions();
  const canRead = permissionsQuery.data?.permissions.includes("company:read") ?? false;
  const canUpdate =
    permissionsQuery.data?.permissions.includes("company:settings:update") ?? false;
  const canManageOperations =
    permissionsQuery.data?.permissions.includes("operations:manage") ?? false;
  const canManageShiftTemplates = canManageOperations || canUpdate;
  const canManageLocationZones =
    canUpdate || hasPermission(permissionsQuery.data?.permissions, "employees:manage");

  const companyTabEnabled = canRead && activeTab === "company";
  const absencesTabEnabled = canRead && activeTab === "absences";

  const settingsQuery = useCompanySettings(companyTabEnabled || absencesTabEnabled);
  const alertRecipientsQuery = useCompanyAlertRecipients(companyTabEnabled && canRead);
  const whatsappQuotaQuery = useWhatsAppQuotaSettings(companyTabEnabled && canRead);
  const workScheduleQuery = useCompanyWorkSchedule(companyTabEnabled);
  const shiftTemplatesQuery = useShiftTemplates({}, companyTabEnabled);
  const employeeCategoriesQuery = useEmployeeCategories(
    { includeInactive: true },
    companyTabEnabled,
  );
  const locationZonesQuery = useLocationZones({ includeInactive: true }, companyTabEnabled);

  const absenceSettingsQuery = useCompanyAbsenceSettings(absencesTabEnabled);
  const absenceCalendarQuery = useDefaultAbsenceCalendar(absencesTabEnabled);
  const storageHealthQuery = useAbsenceAttachmentStorageHealth(
    absencesTabEnabled && canUpdate,
  );

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

  const setTab = (tab: SettingsTab) => {
    setSearchParams({ tab }, { replace: true });
  };

  const operationalAndWorkScheduleSummary = useMemo(() => {
    if (!settingsQuery.data || !workScheduleQuery.data) {
      return null;
    }
    return buildOperationalAndWorkScheduleCardSummary(
      settingsQuery.data,
      workScheduleQuery.data,
    );
  }, [settingsQuery.data, workScheduleQuery.data]);

  if (permissionsQuery.isPending) {
    return <LoadingState />;
  }

  if (!activeCompanyId) {
    return (
      <ErrorState message="Seleccioná una empresa activa para ver y editar su configuración." />
    );
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
    <Stack gap="md" className={pageClasses.page}>
      <PageHeader
        title="Configuración"
        description="Parámetros operativos de la empresa y políticas de ausencias."
        action={
          permissionsQuery.data ? (
            <Group gap="xs">
              <StatusBadge label={permissionsQuery.data.companyName} tone="neutral" variant="light" />
              <StatusBadge
                label={companyRoleLabels[permissionsQuery.data.role]}
                tone="info"
                variant="outline"
              />
            </Group>
          ) : null
        }
      />

      {!canUpdate ? (
        <Alert color="gray" variant="light" className={pageClasses.readOnlyAlert}>
          No tenés permisos para editar esta configuración.
        </Alert>
      ) : null}

      <Tabs
        value={activeTab}
        onChange={(value) => setTab(parseTab(value))}
        keepMounted={false}
        classNames={{
          list: pageClasses.tabList,
          tab: pageClasses.tab,
        }}
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
              title="Configuración operativa y horario laboral"
              description="Defaults operativos, tolerancias del bot y horario semanal predeterminado para operaciones habituales."
              summaryItems={operationalAndWorkScheduleSummary?.summaryItems ?? []}
              loading={settingsQuery.isLoading || workScheduleQuery.isLoading}
              error={
                settingsQuery.isError
                  ? getApiErrorMessage(settingsQuery.error)
                  : workScheduleQuery.isError
                    ? getApiErrorMessage(workScheduleQuery.error)
                    : null
              }
              onRetry={() => {
                void settingsQuery.refetch();
                void workScheduleQuery.refetch();
              }}
              actionLabel="Gestionar configuración"
              canEdit={
                canUpdate && !settingsQuery.isError && !workScheduleQuery.isError
              }
              onAction={() => setOpenDialog("operationalWorkSchedule")}
            />

            <SettingsSummaryCard
              title="Alertas y reporte diario"
              description="Destinatarios compartidos: WhatsApp administrativo y reporte diario de asistencia por email (D-1)."
              summaryItems={[
                {
                  label: "Modo admin",
                  value: settingsQuery.data?.adminAlertDeliveryMode ?? "WHATSAPP_LEGACY",
                },
                {
                  label: "WhatsApp admin",
                  value: settingsQuery.data?.adminAlertsEnabled ? "Habilitado" : "Deshabilitado",
                },
                {
                  label: "Reporte email",
                  value: settingsQuery.data?.dailyAttendanceReportEnabled
                    ? `Habilitado · ${settingsQuery.data?.dailyAttendanceReportTime?.slice(0, 5) ?? "08:00"}`
                    : "Deshabilitado",
                },
                {
                  label: "Zona horaria",
                  value: settingsQuery.data?.operationTimezone ?? "—",
                },
                {
                  label: "Destinatarios",
                  value: `${alertRecipientsQuery.data?.filter((r) => r.isEnabled).length ?? 0} activos`,
                },
              ]}
              loading={settingsQuery.isLoading || alertRecipientsQuery.isLoading}
              error={
                settingsQuery.isError
                  ? getApiErrorMessage(settingsQuery.error)
                  : alertRecipientsQuery.isError
                    ? getApiErrorMessage(alertRecipientsQuery.error)
                    : null
              }
              onRetry={() => {
                void settingsQuery.refetch();
                void alertRecipientsQuery.refetch();
              }}
              actionLabel="Gestionar alertas y reporte"
              canEdit={canUpdate && !settingsQuery.isError && !alertRecipientsQuery.isError}
              onAction={() => setOpenDialog("whatsappAlerts")}
            />

            <SettingsSummaryCard
              title="Cuotas de WhatsApp"
              description="Límites de consultas no críticas por empleado y empresa. La asistencia crítica no se bloquea."
              summaryItems={
                whatsappQuotaQuery.data
                  ? [
                      {
                        label: "Modo empresa",
                        value: whatsappQuotaQuery.data.companyMode,
                      },
                      {
                        label: "Modo efectivo",
                        value: whatsappQuotaQuery.data.effectiveMode,
                      },
                      {
                        label: "Turnos día/semana",
                        value: `${whatsappQuotaQuery.data.dailyTurns} / ${whatsappQuotaQuery.data.weeklyTurns}`,
                      },
                    ]
                  : []
              }
              loading={whatsappQuotaQuery.isLoading}
              error={
                whatsappQuotaQuery.isError
                  ? getApiErrorMessage(whatsappQuotaQuery.error)
                  : null
              }
              onRetry={() => void whatsappQuotaQuery.refetch()}
              actionLabel="Gestionar cuotas"
              canEdit={canUpdate && !whatsappQuotaQuery.isError}
              onAction={() => setOpenDialog("whatsappQuotas")}
            />

            <SettingsSummaryCard
              title="Plantillas de turnos"
              description="Turnos reutilizables (mañana, tarde, noche) para operaciones multi-turno."
              summaryItems={
                shiftTemplatesQuery.data
                  ? [
                      {
                        label: "Activas",
                        value: String(
                          shiftTemplatesQuery.data.filter((template) => template.isActive)
                            .length,
                        ),
                      },
                      {
                        label: "Total",
                        value: String(shiftTemplatesQuery.data.length),
                      },
                      {
                        label: "Nocturnas",
                        value: String(
                          shiftTemplatesQuery.data.filter((template) =>
                            isOvernightShift(template.startTime, template.endTime),
                          ).length,
                        ),
                      },
                    ]
                  : []
              }
              loading={shiftTemplatesQuery.isLoading}
              error={
                shiftTemplatesQuery.isError
                  ? getApiErrorMessage(shiftTemplatesQuery.error)
                  : null
              }
              onRetry={() => void shiftTemplatesQuery.refetch()}
              actionLabel="Gestionar plantillas"
              canEdit={canManageShiftTemplates && !shiftTemplatesQuery.isError}
              onAction={() => setOpenDialog("shiftTemplates")}
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

            <SettingsSummaryCard
              title="Barrios y localidades"
              description="Catálogo geográfico compartido por colaboradores y servicios (barrio + localidad). No se guardan domicilios exactos."
              summaryItems={
                locationZonesQuery.data
                  ? buildLocationZonesSummary(locationZonesQuery.data).summaryItems
                  : []
              }
              chips={
                locationZonesQuery.data
                  ? buildLocationZonesSummary(locationZonesQuery.data).chips
                  : []
              }
              loading={locationZonesQuery.isLoading}
              error={
                locationZonesQuery.isError ? getApiErrorMessage(locationZonesQuery.error) : null
              }
              onRetry={() => void locationZonesQuery.refetch()}
              actionLabel="Gestionar zonas"
              canEdit={canManageLocationZones && !locationZonesQuery.isError}
              onAction={() => setOpenDialog("locationZones")}
            />
          </SimpleGrid>
        </Tabs.Panel>

        <Tabs.Panel value="absences" pt="md">
          {absencesTabEnabled && absenceSettingsQuery.isPending ? <LoadingState /> : null}
          {absencesTabEnabled ? (
            <CompanyAbsenceSettingsTabPanel
              canUpdate={canUpdate}
              onOpenDialog={setOpenDialog}
              absenceSettingsQuery={absenceSettingsQuery}
              absenceCalendarQuery={absenceCalendarQuery}
              settingsQuery={settingsQuery}
              storageHealthQuery={storageHealthQuery}
            />
          ) : null}
        </Tabs.Panel>
      </Tabs>

      {openDialog === "whatsappAlerts" && settingsQuery.data ? (
        <CompanyWhatsAppAlertsDialog
          key={`admin-alerts-${settingsQuery.data.companyId}-${settingsQuery.data.updatedAt}`}
          opened
          onClose={() => setOpenDialog(null)}
          settings={settingsQuery.data}
          canUpdate={canUpdate}
          onSaved={handleSaved}
        />
      ) : null}

      {openDialog === "whatsappQuotas" && whatsappQuotaQuery.data ? (
        <CompanyWhatsAppQuotaSettingsDialog
          key={`wa-quotas-${whatsappQuotaQuery.data.companyId}-${whatsappQuotaQuery.data.updatedAt}`}
          opened
          onClose={() => setOpenDialog(null)}
          settings={whatsappQuotaQuery.data}
          canUpdate={canUpdate}
          onSaved={(message) => {
            handleSaved(message);
            void whatsappQuotaQuery.refetch();
          }}
        />
      ) : null}

      {openDialog === "operationalWorkSchedule" &&
      settingsQuery.data &&
      workScheduleQuery.data ? (
        <CompanyOperationalAndWorkScheduleDialog
          key={`operational-work-schedule-${settingsQuery.data.companyId}-${settingsQuery.data.updatedAt}-${workScheduleQuery.data.updatedAt}`}
          opened
          onClose={() => setOpenDialog(null)}
          settings={settingsQuery.data}
          schedule={workScheduleQuery.data}
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

      {openDialog === "absenceOperationalIntegration" ? (
        <CompanyAbsenceOperationalIntegrationDialog
          opened
          onClose={() => setOpenDialog(null)}
          canUpdate={canUpdate}
          onSaved={handleSaved}
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

      {openDialog === "locationZones" && locationZonesQuery.data ? (
        <LocationZonesDialog
          opened
          onClose={() => setOpenDialog(null)}
          zones={locationZonesQuery.data}
          canUpdate={canManageLocationZones}
          canEditGlobal={isPlatformAdmin}
        />
      ) : null}

      {openDialog === "shiftTemplates" ? (
        <CompanyShiftTemplatesDialog
          opened
          onClose={() => setOpenDialog(null)}
          canUpdate={canManageShiftTemplates}
        />
      ) : null}
    </Stack>
  );
}
