import { Alert, SimpleGrid, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import type { UseQueryResult } from "@tanstack/react-query";
import type { CompanyAbsenceSetting } from "../../../../types/company-absence-settings";
import type { CompanySettings } from "../../../../types/company-settings";
import type { ReactNode } from "react";
import type { AbsenceAttachmentStorageHealth } from "../../../../types/absence";
import type { CompanyWorkCalendar } from "../../../../types/absence-calendar";
import { getApiErrorMessage } from "../../../../utils/errors";
import { buildAbsenceSummary } from "../../company-settings-summaries";
import { SettingsSummaryCard } from "../SettingsSummaryCard";
import pageClasses from "../../settings-visual.module.css";

export type CompanyAbsenceTabDialogKey =
  | "absences"
  | "absenceTypePolicy"
  | "absenceCalendar"
  | "absenceOperationalIntegration";

interface CompanyAbsenceSettingsTabPanelProps {
  canUpdate: boolean;
  onOpenDialog: (key: CompanyAbsenceTabDialogKey) => void;
  absenceSettingsQuery: UseQueryResult<CompanyAbsenceSetting[], Error>;
  absenceCalendarQuery: UseQueryResult<CompanyWorkCalendar, Error>;
  settingsQuery: UseQueryResult<CompanySettings, Error>;
  storageHealthQuery: UseQueryResult<AbsenceAttachmentStorageHealth, Error>;
}

function SettingsSection({
  title,
  description,
  children,
  tone = "primary",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  tone?: "primary" | "secondary";
}) {
  return (
    <Stack gap="sm">
      <Stack gap={4}>
        <Title
          order={4}
          className={pageClasses.sectionTitle}
          c={tone === "secondary" ? "dimmed" : undefined}
        >
          {title}
        </Title>
        {description ? (
          <Text size="sm" className={pageClasses.sectionDescription}>
            {description}
          </Text>
        ) : null}
      </Stack>
      {children}
    </Stack>
  );
}

export function CompanyAbsenceSettingsTabPanel({
  canUpdate,
  onOpenDialog,
  absenceSettingsQuery,
  absenceCalendarQuery,
  settingsQuery,
  storageHealthQuery,
}: CompanyAbsenceSettingsTabPanelProps) {
  const [diagnosticsOpened, { toggle: toggleDiagnostics }] = useDisclosure(false);

  return (
    <Stack gap="xl">
      <SettingsSection
        title="Configuración principal"
        description="Parámetros habituales del módulo de ausencias."
      >
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <SettingsSummaryCard
            title="Tipos y saldos"
            description="Días anuales predeterminados y asignación automática al dar de alta colaboradores."
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
            actionLabel="Gestionar tipos y saldos"
            canEdit={canUpdate && !absenceSettingsQuery.isError}
            onAction={() => onOpenDialog("absences")}
          />

          <SettingsSummaryCard
            title="Políticas"
            description="Modo de conteo (días corridos o hábiles) y requisitos de documentación por tipo."
            summaryItems={[
              {
                label: "Alcance",
                value: "Una política por tipo de ausencia activo",
              },
            ]}
            actionLabel="Gestionar políticas"
            canEdit={canUpdate}
            onAction={() => onOpenDialog("absenceTypePolicy")}
          />
        </SimpleGrid>

        <Alert color="gray" variant="light" className={pageClasses.readOnlyAlert}>
          Los saldos individuales de colaboradores se gestionan en la ficha del empleado. Los
          cambios aquí aplican a nuevos colaboradores o políticas generales, no reescriben saldos
          ya asignados.
        </Alert>
      </SettingsSection>

      <SettingsSection
        title="Configuración avanzada"
        description="Opciones poco frecuentes: calendario laboral, feriados y vínculo con operaciones."
        tone="secondary"
      >
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <SettingsSummaryCard
            title="Calendario laboral"
            description="Días laborables semanales, feriados y excepciones para tipos contados en días hábiles."
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
                    {
                      label: "Calendario extendido",
                      value: settingsQuery.data?.absenceAdvancedCalendarEnabled
                        ? "Activo"
                        : "Inactivo",
                    },
                  ]
                : []
            }
            loading={absenceCalendarQuery.isLoading || settingsQuery.isLoading}
            error={
              absenceCalendarQuery.isError
                ? getApiErrorMessage(absenceCalendarQuery.error)
                : settingsQuery.isError
                  ? getApiErrorMessage(settingsQuery.error)
                  : null
            }
            onRetry={() => {
              void absenceCalendarQuery.refetch();
              void settingsQuery.refetch();
            }}
            actionLabel="Gestionar calendario laboral"
            canEdit={
              canUpdate && !absenceCalendarQuery.isError && !settingsQuery.isError
            }
            onAction={() => onOpenDialog("absenceCalendar")}
            cardClassName={pageClasses.summaryCardSecondary}
          />

          <SettingsSummaryCard
            title="Vínculo con operaciones"
            description="Sincroniza efectos de ausencias aprobadas con jornadas y conflictos operativos."
            summaryItems={
              settingsQuery.data
                ? [
                    {
                      label: "Estado",
                      value: settingsQuery.data.absenceOperationalIntegrationEnabled
                        ? "Habilitado"
                        : "Deshabilitado",
                    },
                  ]
                : []
            }
            loading={settingsQuery.isLoading}
            error={settingsQuery.isError ? getApiErrorMessage(settingsQuery.error) : null}
            onRetry={() => void settingsQuery.refetch()}
            actionLabel="Gestionar vínculo operativo"
            canEdit={canUpdate && !settingsQuery.isError}
            onAction={() => onOpenDialog("absenceOperationalIntegration")}
            cardClassName={pageClasses.summaryCardSecondary}
          />
        </SimpleGrid>

        {canUpdate ? (
          <Stack gap="xs" mt="xs">
            <UnstyledButton
              type="button"
              onClick={toggleDiagnostics}
              aria-expanded={diagnosticsOpened}
              aria-controls="absence-attachment-diagnostics"
            >
              <Text size="sm" c="dimmed">
                {diagnosticsOpened
                  ? "Ocultar diagnóstico de archivos adjuntos"
                  : "Mostrar diagnóstico de archivos adjuntos (servidor)"}
              </Text>
            </UnstyledButton>
            {diagnosticsOpened ? (
              <Stack id="absence-attachment-diagnostics" gap="sm" pt="xs">
                <Text size="xs" c="dimmed">
                  Estado técnico del almacenamiento en el servidor. No modifica políticas ni saldos.
                </Text>
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                  <SettingsSummaryCard
                    title="Archivos adjuntos"
                    description="Comprobá si el servidor puede recibir documentación en solicitudes de ausencia."
                    summaryItems={
                      storageHealthQuery.data
                        ? [
                            {
                              label: "Servicio",
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
                    cardClassName={pageClasses.summaryCardSecondary}
                  />
                </SimpleGrid>
              </Stack>
            ) : null}
          </Stack>
        ) : null}
      </SettingsSection>
    </Stack>
  );
}
