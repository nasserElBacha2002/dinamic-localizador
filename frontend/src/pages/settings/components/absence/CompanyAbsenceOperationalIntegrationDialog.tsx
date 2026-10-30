import { Stack, Switch, Text } from "@mantine/core";
import { useState } from "react";
import { SettingsDialog } from "../SettingsDialog";
import { useCompanySettings, useUpdateCompanySettings } from "../../../../hooks/useCompanySettings";
import { getApiErrorMessage } from "../../../../utils/errors";

interface Props {
  opened: boolean;
  onClose: () => void;
  canUpdate: boolean;
  onSaved: (message: string) => void;
}

export function CompanyAbsenceOperationalIntegrationDialog({
  opened,
  onClose,
  canUpdate,
  onSaved,
}: Props) {
  const settingsQuery = useCompanySettings(opened);
  const updateSettings = useUpdateCompanySettings();
  const [submitError, setSubmitError] = useState<string | null>(null);

  return (
    <SettingsDialog
      opened={opened}
      onClose={onClose}
      title="Vínculo con operaciones"
      subtitle="Define si las ausencias aprobadas generan efectos visibles en jornadas y conflictos operativos."
      size="lg"
      onSave={() => onClose()}
      saveLabel="Cerrar"
      saving={false}
      saveDisabled={false}
      submitError={submitError}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Usá esta opción solo si tu empresa necesita reflejar ausencias en la planificación
          operativa. No recalcula solicitudes ya registradas.
        </Text>

        {settingsQuery.data ? (
          <>
            <Text size="sm">
              Estado actual:{" "}
              {settingsQuery.data.absenceOperationalIntegrationEnabled
                ? "habilitada"
                : "deshabilitada (por defecto)"}
            </Text>
            <Switch
              label="Vínculo operativo de ausencias"
              description="Al aprobar o cancelar, registra conflictos y efectos auditables sin quitar asignaciones en silencio."
              checked={Boolean(settingsQuery.data.absenceOperationalIntegrationEnabled)}
              disabled={!canUpdate || updateSettings.isPending}
              onChange={(event) => {
                setSubmitError(null);
                void updateSettings
                  .mutateAsync({
                    absenceOperationalIntegrationEnabled: event.currentTarget.checked,
                  })
                  .then(() =>
                    onSaved(
                      event.currentTarget.checked
                        ? "Vínculo operativo de ausencias activado."
                        : "Vínculo operativo de ausencias desactivado.",
                    ),
                  )
                  .catch((error: unknown) => setSubmitError(getApiErrorMessage(error)));
              }}
            />
          </>
        ) : (
          <Text c="dimmed">Cargando configuración…</Text>
        )}
      </Stack>
    </SettingsDialog>
  );
}
