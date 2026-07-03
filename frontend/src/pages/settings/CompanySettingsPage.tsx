import { Alert, Button, Group, Stack, Switch, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";
import { ErrorState, FormErrorAlert, LoadingState, PageHeader, SectionCard } from "../../design-system";
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
  toCompanySettingsUpdateInput,
  validateCompanySettingsForm,
} from "../../utils/company-settings-validation";
import { getApiErrorMessage } from "../../utils/errors";
import {
  CompanyAttendanceWhatsAppSettingsSection,
  CompanyInventoryOperationSettingsSection,
  CompanySettingsCheckoutSection,
  CompanySettingsCorrectionsSection,
} from "./company-settings-form-sections";

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
      await updateMutation.mutateAsync(toCompanySettingsUpdateInput(formValues));
      onSaved("Configuración guardada correctamente.");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  return (
    <Stack gap="md">
      <SectionCard title="Datos generales" description="Zona horaria operativa de la empresa.">
        <TextInput
          label="Zona horaria operativa"
          value={formValues.operationTimezone}
          onChange={(event) =>
            setFormValues((current) => ({ ...current, operationTimezone: event.currentTarget.value }))
          }
          disabled={disabled}
        />
      </SectionCard>

      <CompanyInventoryOperationSettingsSection
        formValues={formValues}
        setFormValues={setFormValues}
        disabled={disabled}
      />
      <CompanyAttendanceWhatsAppSettingsSection
        formValues={formValues}
        setFormValues={setFormValues}
        disabled={disabled}
      />
      <CompanySettingsCheckoutSection
        formValues={formValues}
        setFormValues={setFormValues}
        disabled={disabled}
      />
      <CompanySettingsCorrectionsSection
        formValues={formValues}
        setFormValues={setFormValues}
        disabled={disabled}
      />

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
    <SectionCard
      title="Módulos habilitados"
      description="Controlá qué áreas del producto están disponibles para esta empresa."
    >
      <Stack gap="lg">
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

  const handleSaved = (message: string) => {
    notifications.show({ color: "green", message });
  };

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
    <Stack gap="md">
      <PageHeader
        title="Configuración de empresa"
        description="Definí los parámetros operativos que aplican a esta empresa."
      />

      {!canUpdate ? (
        <Alert color="blue">No tenés permisos para editar esta configuración.</Alert>
      ) : null}

      <CompanySettingsForm
        key={`${settingsQuery.data.companyId}-${settingsQuery.data.updatedAt}`}
        settings={settingsQuery.data}
        canUpdate={canUpdate}
        onSaved={handleSaved}
      />

      {modulesQuery.data ? (
        <CompanyModulesForm
          key={`${settingsQuery.data.companyId}-modules-${modulesQuery.dataUpdatedAt}`}
          modules={modulesQuery.data}
          canUpdate={canUpdate}
          onSaved={handleSaved}
        />
      ) : modulesQuery.isError ? (
        <ErrorState message={getApiErrorMessage(modulesQuery.error)} />
      ) : null}
    </Stack>
  );
}
