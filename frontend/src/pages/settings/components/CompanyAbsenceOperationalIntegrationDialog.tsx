import { Alert, Stack, Switch, Text } from "@mantine/core";
import { useState } from "react";
import { SettingsDialog } from "./SettingsDialog";
import { useCompanySettings, useUpdateCompanySettings } from "../../../hooks/useCompanySettings";
import { getApiErrorMessage } from "../../../utils/errors";

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
      title="Integración operativa"
      subtitle="Impacto de ausencias aprobadas sobre operaciones, jornadas y conflictos."
      size="lg"
      onSave={() => onClose()}
      saveLabel="Cerrar"
      saving={false}
      saveDisabled={false}
      submitError={submitError}
    >
      <Stack gap="md">
        <Alert color="yellow">
          Activar solo en empresas piloto. No reprocesa ausencias históricas automáticamente.
          Precondiciones: migración 069/070, jornadas y asignaciones operativas disponibles.
        </Alert>

        {settingsQuery.data ? (
          <>
            <Text size="sm">
              Estado actual:{" "}
              {settingsQuery.data.absenceOperationalIntegrationEnabled
                ? "habilitada"
                : "deshabilitada (por defecto)"}
            </Text>
            <Switch
              label="Integración operativa de ausencias"
              description="Genera conflictos y efectos auditables al aprobar/cancelar, sin eliminar asignaciones silenciosamente."
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
                        ? "Integración operativa de ausencias activada."
                        : "Integración operativa de ausencias desactivada.",
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
