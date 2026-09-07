import { NumberInput, Stack, Switch, TextInput } from "@mantine/core";
import type { Dispatch, SetStateAction } from "react";
import type { CompanySettingsFormValues } from "../../types/company-settings";

type FieldProps = {
  formValues: CompanySettingsFormValues;
  setFormValues: Dispatch<SetStateAction<CompanySettingsFormValues>>;
  disabled: boolean;
};

export function CompanyGeneralSettingsFields({
  formValues,
  setFormValues,
  disabled,
}: FieldProps) {
  return (
    <TextInput
      label="Zona horaria operativa"
      description="Define la zona horaria usada para operaciones, servicios y reportes."
      value={formValues.operationTimezone}
      onChange={(event) =>
        setFormValues((current) => ({ ...current, operationTimezone: event.currentTarget.value }))
      }
      disabled={disabled}
    />
  );
}

export function CompanyOperationOperationSettingsFields({
  formValues,
  setFormValues,
  disabled,
}: FieldProps) {
  return (
    <Stack gap="md">
      <TextInput
        label="Horario de inicio por defecto"
        description="Estos valores se usan como predeterminados al crear operaciones o importar planillas."
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
        label="Tolerancia de llegada temprana"
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
        label="Tolerancia de llegada tardía"
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
        label="Radio permitido por defecto"
        description="Distancia máxima permitida respecto a la ubicación al validar operaciones."
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
      <NumberInput
        label="Margen de revisión de geocerca"
        description="Distancia adicional para marcar una validación como revisión manual."
        value={
          formValues.geofenceReviewMarginMeters === ""
            ? ""
            : Number(formValues.geofenceReviewMarginMeters)
        }
        onChange={(value) =>
          setFormValues((current) => ({
            ...current,
            geofenceReviewMarginMeters: value === "" || value === undefined ? "" : String(value),
          }))
        }
        min={0}
        max={500}
        disabled={disabled}
      />
    </Stack>
  );
}

export function CompanySettingsCheckoutFields({
  formValues,
  setFormValues,
  disabled,
}: FieldProps) {
  return (
    <Switch
      label="Requerir ubicación al finalizar"
      description="Si está activo, el empleado deberá compartir ubicación al enviar “Terminé”."
      checked={formValues.requireCheckoutLocation}
      onChange={(event) =>
        setFormValues((current) => ({
          ...current,
          requireCheckoutLocation: event.currentTarget.checked,
        }))
      }
      disabled={disabled}
    />
  );
}

export function CompanySettingsCorrectionsFields({
  formValues,
  setFormValues,
  disabled,
}: FieldProps) {
  return (
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
  );
}

// Backward-compatible exports for existing section tests
export {
  CompanyOperationOperationSettingsFields as CompanyOperationOperationSettingsSection,
  CompanySettingsCheckoutFields as CompanySettingsCheckoutSection,
  CompanySettingsCorrectionsFields as CompanySettingsCorrectionsSection,
};
