import { NumberInput, Stack, Switch, TextInput } from "@mantine/core";
import type { Dispatch, SetStateAction } from "react";
import { SectionCard } from "../../design-system/components/SectionCard";
import type { CompanySettingsFormValues } from "../../types/company-settings";

type SectionProps = {
  formValues: CompanySettingsFormValues;
  setFormValues: Dispatch<SetStateAction<CompanySettingsFormValues>>;
  disabled: boolean;
};

export function CompanyInventoryOperationSettingsSection({
  formValues,
  setFormValues,
  disabled,
}: SectionProps) {
  return (
    <SectionCard
      title="Configuración de inventarios / operaciones"
      description="Valores por defecto para nuevas operaciones e importaciones."
    >
      <Stack gap="md">
        <TextInput
          label="Horario de inicio por defecto"
          description="Se usa como horario inicial cuando una operación o importación no define hora."
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
          description="Se usa como horario final cuando una operación o importación no define hora."
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
          description="Define cuántos minutos antes del inicio se permite marcar llegada para una operación."
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
          description="Define cuántos minutos después del inicio se permite marcar llegada para una operación."
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
      </Stack>
    </SectionCard>
  );
}

export function CompanyAttendanceWhatsAppSettingsSection({
  formValues,
  setFormValues,
  disabled,
}: SectionProps) {
  return (
    <SectionCard
      title="Configuración de asistencia / WhatsApp"
      description="Parámetros usados por el bot de WhatsApp para puntualidad y salida."
    >
      <Stack gap="md">
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
        <NumberInput
          label="Tolerancia de puntualidad WhatsApp (min)"
          description="Se usa para determinar si una llegada por WhatsApp se considera a tiempo."
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
          description="Se usa para determinar si una finalización por WhatsApp se considera salida anticipada."
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
    </SectionCard>
  );
}

export function CompanySettingsCheckoutSection({
  formValues,
  setFormValues,
  disabled,
}: SectionProps) {
  return (
    <SectionCard title="Check-out">
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
    </SectionCard>
  );
}

export function CompanySettingsCorrectionsSection({
  formValues,
  setFormValues,
  disabled,
}: SectionProps) {
  return (
    <SectionCard title="Correcciones manuales">
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
    </SectionCard>
  );
}
