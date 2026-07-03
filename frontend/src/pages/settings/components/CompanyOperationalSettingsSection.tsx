import { Button, Group, NumberInput, Stack, Text, TextInput } from "@mantine/core";
import { useMemo, useState } from "react";
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

interface CompanyOperationalSettingsSectionProps {
  settings: CompanySettings;
  canUpdate: boolean;
  onSaved: (message: string) => void;
}

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
          <TextInput
            label="Zona horaria operativa"
            value={formValues.operationTimezone}
            onChange={(event) =>
              setFormValues((current) => ({
                ...current,
                operationTimezone: event.currentTarget.value,
              }))
            }
            disabled={disabled}
          />
          <NumberInput
            label="Radio permitido por defecto (m)"
            description="Default para operaciones e importaciones."
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
          <TextInput
            label="Horario de inicio por defecto"
            description="Default para operaciones e importaciones."
            placeholder="20:30"
            value={formValues.defaultOperationStartTime}
            onChange={(event) =>
              setFormValues((current) => ({
                ...current,
                defaultOperationStartTime: event.currentTarget.value,
              }))
            }
            disabled={disabled}
          />
          <TextInput
            label="Horario de fin por defecto"
            description="Default para operaciones e importaciones."
            placeholder="03:00"
            value={formValues.defaultOperationEndTime}
            onChange={(event) =>
              setFormValues((current) => ({
                ...current,
                defaultOperationEndTime: event.currentTarget.value,
              }))
            }
            disabled={disabled}
          />
          <NumberInput
            label="Tolerancia de llegada temprana para operaciones (min)"
            description="Default para operaciones e importaciones."
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
            min={0}
            max={240}
            disabled={disabled}
          />
          <NumberInput
            label="Tolerancia de llegada tardía para operaciones (min)"
            description="Default para operaciones e importaciones."
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
            min={0}
            max={240}
            disabled={disabled}
          />
          <NumberInput
            label="Tolerancia de puntualidad WhatsApp (min)"
            description="Validación del mensaje “Llegué”."
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
            label="Tolerancia de salida anticipada WhatsApp (min)"
            description="Validación del mensaje “Terminé”."
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
            min={0}
            max={240}
            disabled={disabled}
          />
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
