import { Button, Group, NumberInput, Select, Stack, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import { getCanonicalOperationTimezone, getOperationTimezoneOptions } from "../../../constants/operation-timezones";
import { FormErrorAlert, FormGrid, SectionCard } from "../../../design-system";
import { useUpdateCompanySettings } from "../../../hooks/useCompanySettings";
import type { CompanySettings } from "../../../types/company-settings";
import {
  operationalSettingsEqual,
  toOperationalSettingsFormValues,
  toOperationalSettingsUpdateInput,
  validateOperationalSettingsForm,
  type OperationalSettingsFormValues,
} from "../../../utils/company-settings-validation";
import { getApiErrorMessage } from "../../../utils/errors";
import { SettingsFormField } from "./SettingsFormField";
import { OperationTimeInput } from "./OperationTimeInput";

interface CompanyOperationalSettingsSectionProps {
  settings: CompanySettings;
  canUpdate: boolean;
  onSaved: (message: string) => void;
}

const numberInputProps = {
  min: 0,
  max: 240,
  step: 1,
  hideControls: true,
} as const;

export function CompanyOperationalSettingsSection({
  settings,
  canUpdate,
  onSaved,
}: CompanyOperationalSettingsSectionProps) {
  const updateMutation = useUpdateCompanySettings();
  const baseline = useMemo(() => toOperationalSettingsFormValues(settings), [settings]);
  const [formValues, setFormValues] = useState<OperationalSettingsFormValues>(baseline);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validationErrors = useMemo(
    () => validateOperationalSettingsForm(formValues),
    [formValues],
  );
  const hasChanges = !operationalSettingsEqual(formValues, baseline);
  const isValid = validationErrors.length === 0;
  const disabled = !canUpdate || updateMutation.isPending;
  const timezoneOptions = useMemo(
    () => getOperationTimezoneOptions(formValues.operationTimezone),
    [formValues.operationTimezone],
  );
  const selectedTimezone = getCanonicalOperationTimezone(formValues.operationTimezone);

  const handleReset = () => {
    setFormValues(baseline);
    setSubmitError(null);
  };

  const handleSave = async () => {
    if (!canUpdate || !hasChanges || !isValid || updateMutation.isPending) {
      return;
    }

    setSubmitError(null);
    try {
      await updateMutation.mutateAsync(toOperationalSettingsUpdateInput(formValues));
      onSaved("Configuración operativa guardada correctamente.");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  return (
    <SectionCard
      title="Configuración operativa"
      description="Defaults usados por operaciones, importaciones y validaciones del bot."
    >
      <Stack gap="md">
        <FormGrid columns={{ base: 1, md: 2 }}>
          <SettingsFormField
            label="Zona horaria operativa"
            description="Zona horaria usada por operaciones y reportes."
          >
            <Select
              searchable
              data={timezoneOptions}
              value={selectedTimezone}
              onChange={(value) => {
                if (!value) {
                  return;
                }
                setFormValues((current) => ({
                  ...current,
                  operationTimezone: value,
                }));
              }}
              nothingFoundMessage="No se encontraron zonas horarias"
              disabled={disabled}
              aria-label="Zona horaria operativa"
            />
          </SettingsFormField>

          <SettingsFormField
            label="Radio permitido por defecto (m)"
            description="Default para operaciones e importaciones."
          >
            <NumberInput
              value={formValues.defaultRadiusMeters === "" ? "" : Number(formValues.defaultRadiusMeters)}
              onChange={(value) =>
                setFormValues((current) => ({
                  ...current,
                  defaultRadiusMeters: value === "" || value === undefined ? "" : String(value),
                }))
              }
              min={10}
              max={5000}
              step={1}
              hideControls
              disabled={disabled}
            />
          </SettingsFormField>

          <SettingsFormField
            label="Horario de inicio por defecto"
            description="Default para operaciones e importaciones."
          >
            <OperationTimeInput
              value={formValues.defaultOperationStartTime}
              onChange={(value) =>
                setFormValues((current) => ({
                  ...current,
                  defaultOperationStartTime: value,
                }))
              }
              disabled={disabled}
              aria-label="Horario de inicio por defecto"
            />
          </SettingsFormField>

          <SettingsFormField
            label="Horario de fin por defecto"
            description="Default para operaciones e importaciones."
          >
            <OperationTimeInput
              value={formValues.defaultOperationEndTime}
              onChange={(value) =>
                setFormValues((current) => ({
                  ...current,
                  defaultOperationEndTime: value,
                }))
              }
              disabled={disabled}
              aria-label="Horario de fin por defecto"
            />
          </SettingsFormField>

          <SettingsFormField
            label="Tolerancia de llegada temprana para operaciones (min)"
            description="Default para operaciones e importaciones."
          >
            <NumberInput
              value={
                formValues.defaultEarlyArrivalToleranceMinutes === ""
                  ? ""
                  : Number(formValues.defaultEarlyArrivalToleranceMinutes)
              }
              onChange={(value) =>
                setFormValues((current) => ({
                  ...current,
                  defaultEarlyArrivalToleranceMinutes:
                    value === "" || value === undefined ? "" : String(value),
                }))
              }
              {...numberInputProps}
              disabled={disabled}
            />
          </SettingsFormField>

          <SettingsFormField
            label="Tolerancia de llegada tardía para operaciones (min)"
            description="Default para operaciones e importaciones."
          >
            <NumberInput
              value={
                formValues.defaultLateArrivalToleranceMinutes === ""
                  ? ""
                  : Number(formValues.defaultLateArrivalToleranceMinutes)
              }
              onChange={(value) =>
                setFormValues((current) => ({
                  ...current,
                  defaultLateArrivalToleranceMinutes:
                    value === "" || value === undefined ? "" : String(value),
                }))
              }
              {...numberInputProps}
              disabled={disabled}
            />
          </SettingsFormField>

          <SettingsFormField
            label="Tolerancia de puntualidad WhatsApp (min)"
            description="Validación del mensaje “Llegué”."
          >
            <NumberInput
              value={formValues.lateGraceMinutes === "" ? "" : Number(formValues.lateGraceMinutes)}
              onChange={(value) =>
                setFormValues((current) => ({
                  ...current,
                  lateGraceMinutes: value === "" || value === undefined ? "" : String(value),
                }))
              }
              {...numberInputProps}
              disabled={disabled}
            />
          </SettingsFormField>

          <SettingsFormField
            label="Tolerancia de salida anticipada WhatsApp (min)"
            description="Validación del mensaje “Terminé”."
          >
            <NumberInput
              value={
                formValues.earlyLeaveToleranceMinutes === ""
                  ? ""
                  : Number(formValues.earlyLeaveToleranceMinutes)
              }
              onChange={(value) =>
                setFormValues((current) => ({
                  ...current,
                  earlyLeaveToleranceMinutes:
                    value === "" || value === undefined ? "" : String(value),
                }))
              }
              {...numberInputProps}
              disabled={disabled}
            />
          </SettingsFormField>
        </FormGrid>

{/*         <Text fw={600} size="sm">
          Confirmación de asistencia
        </Text> */}
        <FormGrid columns={{ base: 1, md: 2 }}>
{/*           <SettingsFormField
            label="Enviar recordatorio automático"
            description="WhatsApp proactivo a empleados con confirmación pendiente."
          >
            <Switch
              checked={formValues.confirmationReminderEnabled}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                setFormValues((current) => ({
                  ...current,
                  confirmationReminderEnabled: checked,
                }));
              }}
              disabled={disabled}
              aria-label="Enviar recordatorio automático de confirmación"
            />
          </SettingsFormField> */}

          <SettingsFormField
            label="Enviar recordatorio (horas antes)"
            description="Ventana configurable por empresa antes del inicio del inventario."
          >
            <NumberInput
              value={
                formValues.confirmationReminderHoursBefore === ""
                  ? ""
                  : Number(formValues.confirmationReminderHoursBefore)
              }
              onChange={(value) =>
                setFormValues((current) => ({
                  ...current,
                  confirmationReminderHoursBefore:
                    value === "" || value === undefined ? "" : String(value),
                }))
              }
              min={1}
              max={168}
              step={1}
              hideControls
              disabled={disabled || !formValues.confirmationReminderEnabled}
            />
          </SettingsFormField>
        </FormGrid>

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
              Guardar configuración
            </Button>
            <Button
              variant="default"
              onClick={handleReset}
              disabled={!hasChanges || updateMutation.isPending}
            >
              Descartar cambios
            </Button>
          </Group>
        ) : null}
      </Stack>
    </SectionCard>
  );
}
