import { Alert, Button, Group, NumberInput, Stack, Switch, Text, TextInput, Title } from "@mantine/core";
import { useMemo, useState } from "react";
import { ErrorState } from "../../components/common/ErrorState";
import { FeedbackSnackbar } from "../../components/common/FeedbackSnackbar";
import { LoadingState } from "../../components/common/LoadingState";
import { FormErrorAlert, PageHeader, SectionCard } from "../../design-system";
import { useCompanySettings, useUpdateCompanySettings } from "../../hooks/useCompanySettings";
import { useCompanyModules, useUpdateCompanyModules } from "../../hooks/useCompanyModules";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import type { CompanySettings, CompanySettingsFormValues } from "../../types/company-settings";
import type { CompanyModule, CompanyModuleKey } from "../../types/company-module";
import {
  COMPANY_MODULE_DESCRIPTIONS,
  COMPANY_MODULE_LABELS,
  validateCompanyModulesUpdate,
  moduleStatesEqual,
} from "../../utils/company-modules";
import {
  formValuesEqual,
  toCompanySettingsFormValues,
  validateCompanySettingsForm,
} from "../../utils/company-settings-validation";
import { getApiErrorMessage } from "../../utils/errors";

interface CompanySettingsFormProps {
  settings: CompanySettings;
  canUpdate: boolean;
  onSaved: (message: string) => void;
}

function CompanySettingsForm({ settings, canUpdate, onSaved }: CompanySettingsFormProps) {
  const updateMutation = useUpdateCompanySettings();
  const [formValues, setFormValues] = useState<CompanySettingsFormValues>(() =>
    toCompanySettingsFormValues(settings),
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  const baselineValues = useMemo(() => toCompanySettingsFormValues(settings), [settings]);
  const validationErrors = useMemo(() => validateCompanySettingsForm(formValues), [formValues]);
  const hasChanges = !formValuesEqual(formValues, baselineValues);
  const isValid = validationErrors.length === 0;
  const isReadOnly = !canUpdate;
  const disabled = isReadOnly || updateMutation.isPending;

  const handleReset = () => {
    setFormValues(baselineValues);
    setSubmitError(null);
  };

  const handleSave = async () => {
    if (!canUpdate || !isValid || !hasChanges || updateMutation.isPending) {
      return;
    }

    setSubmitError(null);
    try {
      await updateMutation.mutateAsync({
        operationTimezone: formValues.operationTimezone.trim(),
        defaultRadiusMeters: Number(formValues.defaultRadiusMeters),
        lateGraceMinutes: Number(formValues.lateGraceMinutes),
        earlyLeaveToleranceMinutes: Number(formValues.earlyLeaveToleranceMinutes),
        requireCheckoutLocation: formValues.requireCheckoutLocation,
        allowManualAttendanceCorrections: formValues.allowManualAttendanceCorrections,
      });
      onSaved("Configuración guardada correctamente.");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  return (
    <SectionCard>
      <Stack gap="lg">
        <div>
          <Title order={4} mb="sm">
            General
          </Title>
          <TextInput
            label="Zona horaria operativa"
            value={formValues.operationTimezone}
            onChange={(event) =>
              setFormValues((current) => ({ ...current, operationTimezone: event.currentTarget.value }))
            }
            disabled={disabled}
          />
        </div>

        <div>
          <Title order={4} mb="sm">
            Geolocalización
          </Title>
          <NumberInput
            label="Radio predeterminado de validación (m)"
            description="Se usa para validar la ubicación enviada por WhatsApp en Llegué y Terminé."
            value={formValues.defaultRadiusMeters === "" ? "" : Number(formValues.defaultRadiusMeters)}
            onChange={(value) =>
              setFormValues((current) => ({
                ...current,
                defaultRadiusMeters: value === "" || value === undefined ? "" : String(value),
              }))
            }
            min={10}
            max={5000}
            disabled={disabled}
          />
        </div>

        <div>
          <Title order={4} mb="sm">
            Tolerancias horarias
          </Title>
          <Stack gap="md">
            <NumberInput
              label="Tolerancia de llegada tarde (min)"
              description="Define cuántos minutos después del inicio se considera llegada a tiempo."
              value={formValues.lateGraceMinutes === "" ? "" : Number(formValues.lateGraceMinutes)}
              onChange={(value) =>
                setFormValues((current) => ({
                  ...current,
                  lateGraceMinutes: value === "" || value === undefined ? "" : String(value),
                }))
              }
              min={0}
              max={240}
              disabled={disabled}
            />
            <NumberInput
              label="Tolerancia de salida anticipada (min)"
              description="Define cuántos minutos antes del horario de finalización se permite terminar sin marcar salida anticipada."
              value={
                formValues.earlyLeaveToleranceMinutes === ""
                  ? ""
                  : Number(formValues.earlyLeaveToleranceMinutes)
              }
              onChange={(value) =>
                setFormValues((current) => ({
                  ...current,
                  earlyLeaveToleranceMinutes: value === "" || value === undefined ? "" : String(value),
                }))
              }
              min={0}
              max={240}
              disabled={disabled}
            />
          </Stack>
        </div>

        <div>
          <Title order={4} mb="sm">
            Check-out
          </Title>
          <Switch
            label="Requerir ubicación al finalizar"
            description="Si está activo, el empleado deberá compartir ubicación al enviar 'Terminé'."
            checked={formValues.requireCheckoutLocation}
            onChange={(event) =>
              setFormValues((current) => ({
                ...current,
                requireCheckoutLocation: event.currentTarget.checked,
              }))
            }
            disabled={disabled}
          />
        </div>

        <div>
          <Title order={4} mb="sm">
            Correcciones manuales
          </Title>
          <Switch
            label="Permitir correcciones manuales de asistencia"
            description="Permite que usuarios autorizados registren o ajusten asistencias desde el panel."
            checked={formValues.allowManualAttendanceCorrections}
            onChange={(event) =>
              setFormValues((current) => ({
                ...current,
                allowManualAttendanceCorrections: event.currentTarget.checked,
              }))
            }
            disabled={disabled}
          />
        </div>

        {validationErrors.length > 0 ? (
          <Text size="sm" c="red">
            {validationErrors.join(" ")}
          </Text>
        ) : null}
        <FormErrorAlert message={submitError} />

        {canUpdate ? (
          <Group gap="sm">
            <Button
              onClick={() => void handleSave()}
              disabled={!hasChanges || !isValid || updateMutation.isPending}
              loading={updateMutation.isPending}
            >
              Guardar cambios
            </Button>
            <Button variant="default" onClick={handleReset} disabled={!hasChanges || updateMutation.isPending}>
              Descartar cambios
            </Button>
          </Group>
        ) : null}
      </Stack>
    </SectionCard>
  );
}

const ALL_MODULE_KEYS: CompanyModuleKey[] = [
  "attendance",
  "inventory_operations",
  "absences",
  "reports",
  "bot_simulator",
];

interface CompanyModulesFormProps {
  modules: CompanyModule[];
  canUpdate: boolean;
  onSaved: (message: string) => void;
}

function CompanyModulesForm({ modules, canUpdate, onSaved }: CompanyModulesFormProps) {
  const updateMutation = useUpdateCompanyModules();
  const [draftModules, setDraftModules] = useState<CompanyModule[]>(() => modules);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const hasChanges = !moduleStatesEqual(draftModules, modules);
  const validationError = validateCompanyModulesUpdate(draftModules);
  const isReadOnly = !canUpdate;
  const disabled = isReadOnly || updateMutation.isPending;

  const handleToggle = (moduleKey: CompanyModuleKey, isEnabled: boolean) => {
    setDraftModules((current) =>
      current.map((module) =>
        module.moduleKey === moduleKey ? { ...module, isEnabled } : module,
      ),
    );
    setSubmitError(null);
  };

  const handleReset = () => {
    setDraftModules(modules);
    setSubmitError(null);
  };

  const handleSave = async () => {
    if (!canUpdate || validationError || !hasChanges || updateMutation.isPending) {
      return;
    }

    setSubmitError(null);
    try {
      await updateMutation.mutateAsync({
        modules: draftModules.map((module) => ({
          moduleKey: module.moduleKey,
          isEnabled: module.isEnabled,
        })),
      });
      onSaved("Módulos guardados correctamente.");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  return (
    <SectionCard>
      <Stack gap="lg" mt="md">
        <div>
          <Title order={4}>Módulos habilitados</Title>
          <Text size="sm" c="dimmed">
            Controlá qué áreas del producto están disponibles para esta empresa.
          </Text>
        </div>

        {ALL_MODULE_KEYS.map((moduleKey) => {
          const moduleState = draftModules.find((module) => module.moduleKey === moduleKey);
          return (
            <Switch
              key={moduleKey}
              label={COMPANY_MODULE_LABELS[moduleKey]}
              description={COMPANY_MODULE_DESCRIPTIONS[moduleKey]}
              checked={moduleState?.isEnabled ?? false}
              onChange={(event) => handleToggle(moduleKey, event.currentTarget.checked)}
              disabled={disabled}
            />
          );
        })}

        {validationError ? (
          <Text size="sm" c="red">
            {validationError}
          </Text>
        ) : null}
        <FormErrorAlert message={submitError} />

        {canUpdate ? (
          <Group gap="sm">
            <Button
              onClick={() => void handleSave()}
              disabled={!hasChanges || Boolean(validationError) || updateMutation.isPending}
              loading={updateMutation.isPending}
            >
              Guardar módulos
            </Button>
            <Button variant="default" onClick={handleReset} disabled={!hasChanges || updateMutation.isPending}>
              Descartar cambios
            </Button>
          </Group>
        ) : null}
      </Stack>
    </SectionCard>
  );
}

export function CompanySettingsPage() {
  const permissionsQuery = useCompanyPermissions();
  const canRead = permissionsQuery.data?.permissions.includes("company:read") ?? false;
  const canUpdate =
    permissionsQuery.data?.permissions.includes("company:settings:update") ?? false;

  const settingsQuery = useCompanySettings(canRead);
  const modulesQuery = useCompanyModules(canRead);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (permissionsQuery.isPending) {
    return <LoadingState />;
  }

  if (!canRead) {
    return <ErrorState message="No tenés permisos para ver la configuración de esta empresa." />;
  }

  if (settingsQuery.isPending || modulesQuery.isPending) {
    return <LoadingState />;
  }

  if (settingsQuery.isError || !settingsQuery.data) {
    return <ErrorState message={getApiErrorMessage(settingsQuery.error)} />;
  }

  return (
    <>
      <PageHeader
        title="Configuración de empresa"
        description="Definí los parámetros operativos que aplican a esta empresa."
      />

      {!canUpdate ? (
        <Alert color="blue" mb="md">
          No tenés permisos para editar esta configuración.
        </Alert>
      ) : null}

      <CompanySettingsForm
        key={`${settingsQuery.data.companyId}-${settingsQuery.data.updatedAt}`}
        settings={settingsQuery.data}
        canUpdate={canUpdate}
        onSaved={setSuccessMessage}
      />

      {modulesQuery.data ? (
        <CompanyModulesForm
          key={`${settingsQuery.data.companyId}-modules-${modulesQuery.dataUpdatedAt}`}
          modules={modulesQuery.data}
          canUpdate={canUpdate}
          onSaved={setSuccessMessage}
        />
      ) : modulesQuery.isError ? (
        <ErrorState message={getApiErrorMessage(modulesQuery.error)} />
      ) : null}

      <FeedbackSnackbar
        open={Boolean(successMessage)}
        message={successMessage ?? ""}
        onClose={() => setSuccessMessage(null)}
      />
    </>
  );
}
