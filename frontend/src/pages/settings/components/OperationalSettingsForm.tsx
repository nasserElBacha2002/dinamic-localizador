import { NumberInput, Select, Stack, Text } from "@mantine/core";
import { useMemo } from "react";
import {
  getCanonicalOperationTimezone,
  getOperationTimezoneOptions,
} from "../../../constants/operation-timezones";
import { FormGrid } from "../../../design-system";
import type { OperationalSettingsFormValues } from "../../../utils/company-settings-validation";
import { SettingsFormField } from "./SettingsFormField";
import { OperationTimeInput } from "./OperationTimeInput";

const numberInputProps = {
  min: 0,
  max: 240,
  step: 1,
  hideControls: true,
} as const;

export interface OperationalSettingsFormProps {
  values: OperationalSettingsFormValues;
  onChange: (values: OperationalSettingsFormValues) => void;
  disabled?: boolean;
  validationErrors?: string[];
}

export function OperationalSettingsForm({
  values,
  onChange,
  disabled = false,
  validationErrors = [],
}: OperationalSettingsFormProps) {
  const timezoneOptions = useMemo(
    () => getOperationTimezoneOptions(values.operationTimezone),
    [values.operationTimezone],
  );
  const selectedTimezone = getCanonicalOperationTimezone(values.operationTimezone);

  const update = (patch: Partial<OperationalSettingsFormValues>) => {
    onChange({ ...values, ...patch });
  };

  return (
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
              update({ operationTimezone: value });
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
            value={values.defaultRadiusMeters === "" ? "" : Number(values.defaultRadiusMeters)}
            onChange={(value) =>
              update({
                defaultRadiusMeters: value === "" || value === undefined ? "" : String(value),
              })
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
            value={values.defaultOperationStartTime}
            onChange={(value) => update({ defaultOperationStartTime: value })}
            disabled={disabled}
            aria-label="Horario de inicio por defecto"
          />
        </SettingsFormField>

        <SettingsFormField
          label="Horario de fin por defecto"
          description="Default para operaciones e importaciones."
        >
          <OperationTimeInput
            value={values.defaultOperationEndTime}
            onChange={(value) => update({ defaultOperationEndTime: value })}
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
              values.defaultEarlyArrivalToleranceMinutes === ""
                ? ""
                : Number(values.defaultEarlyArrivalToleranceMinutes)
            }
            onChange={(value) =>
              update({
                defaultEarlyArrivalToleranceMinutes:
                  value === "" || value === undefined ? "" : String(value),
              })
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
              values.defaultLateArrivalToleranceMinutes === ""
                ? ""
                : Number(values.defaultLateArrivalToleranceMinutes)
            }
            onChange={(value) =>
              update({
                defaultLateArrivalToleranceMinutes:
                  value === "" || value === undefined ? "" : String(value),
              })
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
            value={values.lateGraceMinutes === "" ? "" : Number(values.lateGraceMinutes)}
            onChange={(value) =>
              update({
                lateGraceMinutes: value === "" || value === undefined ? "" : String(value),
              })
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
              values.earlyLeaveToleranceMinutes === ""
                ? ""
                : Number(values.earlyLeaveToleranceMinutes)
            }
            onChange={(value) =>
              update({
                earlyLeaveToleranceMinutes:
                  value === "" || value === undefined ? "" : String(value),
              })
            }
            {...numberInputProps}
            disabled={disabled}
          />
        </SettingsFormField>

        <SettingsFormField
          label="Vencimiento de salida pendiente (horas)"
          description="Cantidad de horas después del fin de una operación durante las que un empleado todavía puede registrar su salida."
        >
          <NumberInput
            value={
              values.pendingOperationExpirationHours === ""
                ? ""
                : Number(values.pendingOperationExpirationHours)
            }
            onChange={(value) =>
              update({
                pendingOperationExpirationHours:
                  value === "" || value === undefined ? "" : String(value),
              })
            }
            min={1}
            max={168}
            step={1}
            hideControls
            disabled={disabled}
          />
        </SettingsFormField>
      </FormGrid>

      <FormGrid columns={{ base: 1, md: 2 }}>
        <SettingsFormField
          label="Enviar recordatorio (horas antes)"
          description="Ventana configurable por empresa antes del inicio de la operación."
        >
          <NumberInput
            value={
              values.confirmationReminderHoursBefore === ""
                ? ""
                : Number(values.confirmationReminderHoursBefore)
            }
            onChange={(value) =>
              update({
                confirmationReminderHoursBefore:
                  value === "" || value === undefined ? "" : String(value),
              })
            }
            min={1}
            max={168}
            step={1}
            hideControls
            disabled={disabled || !values.confirmationReminderEnabled}
          />
        </SettingsFormField>
      </FormGrid>

      {validationErrors.length > 0 ? (
        <Text size="sm" c="red">
          {validationErrors.join(" ")}
        </Text>
      ) : null}
    </Stack>
  );
}
