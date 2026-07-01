import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  FormHelperText,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import { ErrorState } from "../../components/common/ErrorState";
import { FeedbackSnackbar } from "../../components/common/FeedbackSnackbar";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/common/PageHeader";
import { useCompanySettings, useUpdateCompanySettings } from "../../hooks/useCompanySettings";
import { useCompanyModules, useUpdateCompanyModules } from "../../hooks/useCompanyModules";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { AdminLayout } from "../../layouts/AdminLayout";
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
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h6" gutterBottom>
            General
          </Typography>
          <TextField
            label="Zona horaria operativa"
            value={formValues.operationTimezone}
            onChange={(event) =>
              setFormValues((current) => ({ ...current, operationTimezone: event.target.value }))
            }
            fullWidth
            disabled={isReadOnly || updateMutation.isPending}
          />
        </Box>

        <Box>
          <Typography variant="h6" gutterBottom>
            Geolocalización
          </Typography>
          <TextField
            label="Radio predeterminado de validación (m)"
            type="number"
            value={formValues.defaultRadiusMeters}
            onChange={(event) =>
              setFormValues((current) => ({ ...current, defaultRadiusMeters: event.target.value }))
            }
            helperText="Se usa como radio base para validar ubicaciones de asistencia."
            inputProps={{ min: 10, max: 5000, step: 1 }}
            fullWidth
            disabled={isReadOnly || updateMutation.isPending}
          />
        </Box>

        <Box>
          <Typography variant="h6" gutterBottom>
            Tolerancias horarias
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Tolerancia de llegada tarde (min)"
              type="number"
              value={formValues.lateGraceMinutes}
              onChange={(event) =>
                setFormValues((current) => ({ ...current, lateGraceMinutes: event.target.value }))
              }
              inputProps={{ min: 0, max: 240, step: 1 }}
              fullWidth
              disabled={isReadOnly || updateMutation.isPending}
            />
            <TextField
              label="Tolerancia de salida anticipada (min)"
              type="number"
              value={formValues.earlyLeaveToleranceMinutes}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  earlyLeaveToleranceMinutes: event.target.value,
                }))
              }
              inputProps={{ min: 0, max: 240, step: 1 }}
              fullWidth
              disabled={isReadOnly || updateMutation.isPending}
            />
          </Stack>
        </Box>

        <Box>
          <Typography variant="h6" gutterBottom>
            Check-out
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={formValues.requireCheckoutLocation}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    requireCheckoutLocation: event.target.checked,
                  }))
                }
                disabled={isReadOnly || updateMutation.isPending}
              />
            }
            label="Requerir ubicación al finalizar"
          />
          <FormHelperText>
            Si está activo, el empleado deberá compartir ubicación al enviar &apos;Terminé&apos;.
          </FormHelperText>
        </Box>

        <Box>
          <Typography variant="h6" gutterBottom>
            Correcciones manuales
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={formValues.allowManualAttendanceCorrections}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    allowManualAttendanceCorrections: event.target.checked,
                  }))
                }
                disabled={isReadOnly || updateMutation.isPending}
              />
            }
            label="Permitir correcciones manuales de asistencia"
          />
          <FormHelperText>
            Permite que usuarios autorizados registren o ajusten asistencias desde el panel.
          </FormHelperText>
        </Box>

        {validationErrors.length > 0 ? (
          <FormHelperText error>{validationErrors.join(" ")}</FormHelperText>
        ) : null}
        {submitError ? <FormHelperText error>{submitError}</FormHelperText> : null}

        {canUpdate ? (
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              onClick={() => void handleSave()}
              disabled={!hasChanges || !isValid || updateMutation.isPending}
            >
              Guardar cambios
            </Button>
            <Button
              variant="outlined"
              onClick={handleReset}
              disabled={!hasChanges || updateMutation.isPending}
            >
              Descartar cambios
            </Button>
          </Stack>
        ) : null}
      </Stack>
    </Paper>
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
    <Paper variant="outlined" sx={{ p: 3, mt: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h6" gutterBottom>
            Módulos habilitados
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Controlá qué áreas del producto están disponibles para esta empresa.
          </Typography>
        </Box>

        {ALL_MODULE_KEYS.map((moduleKey) => {
          const moduleState = draftModules.find((module) => module.moduleKey === moduleKey);
          return (
            <Box key={moduleKey}>
              <FormControlLabel
                control={
                  <Switch
                    checked={moduleState?.isEnabled ?? false}
                    onChange={(event) => handleToggle(moduleKey, event.target.checked)}
                    disabled={isReadOnly || updateMutation.isPending}
                  />
                }
                label={COMPANY_MODULE_LABELS[moduleKey]}
              />
              <FormHelperText>{COMPANY_MODULE_DESCRIPTIONS[moduleKey]}</FormHelperText>
            </Box>
          );
        })}

        {validationError ? <FormHelperText error>{validationError}</FormHelperText> : null}
        {submitError ? <FormHelperText error>{submitError}</FormHelperText> : null}

        {canUpdate ? (
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              onClick={() => void handleSave()}
              disabled={!hasChanges || Boolean(validationError) || updateMutation.isPending}
            >
              Guardar módulos
            </Button>
            <Button
              variant="outlined"
              onClick={handleReset}
              disabled={!hasChanges || updateMutation.isPending}
            >
              Descartar cambios
            </Button>
          </Stack>
        ) : null}
      </Stack>
    </Paper>
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
    return (
      <AdminLayout>
        <LoadingState />
      </AdminLayout>
    );
  }

  if (!canRead) {
    return (
      <AdminLayout>
        <ErrorState message="No tenés permisos para ver la configuración de esta empresa." />
      </AdminLayout>
    );
  }

  if (settingsQuery.isPending || modulesQuery.isPending) {
    return (
      <AdminLayout>
        <LoadingState />
      </AdminLayout>
    );
  }

  if (settingsQuery.isError || !settingsQuery.data) {
    return (
      <AdminLayout>
        <ErrorState message={getApiErrorMessage(settingsQuery.error)} />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <PageHeader
        title="Configuración de empresa"
        description="Definí los parámetros operativos que aplican a esta empresa."
      />

      {!canUpdate ? (
        <Alert severity="info" sx={{ mb: 2 }}>
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
    </AdminLayout>
  );
}
