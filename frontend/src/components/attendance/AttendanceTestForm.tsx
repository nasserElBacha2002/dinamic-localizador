import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Stack } from "@mantine/core";
import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { attendanceTestFormSchema, type AttendanceTestFormValues } from "../../schemas/attendance.schema";
import {
  FormActions,
  FormErrorAlert,
  FormGrid,
  FormSection,
  RHFDateTimeInput,
  RHFNumberInput,
  RHFSelect,
  RHFTextarea,
  RHFTextInput,
} from "../../design-system";
import {
  locationStatusLabels,
  punctualityStatusLabels,
  validationStatusLabels,
} from "../../utils/labels";
import { EmployeeSearchAutocomplete } from "../employees/EmployeeSearchAutocomplete";
import { OperationSearchAutocomplete } from "../operations/OperationSearchAutocomplete";

interface AttendanceTestFormProps {
  defaultValues: AttendanceTestFormValues;
  submitLabel: string;
  cancelTo: string;
  loading?: boolean;
  errorMessage?: string | null;
  onSubmit: (values: AttendanceTestFormValues) => Promise<void>;
}

export function AttendanceTestForm({
  defaultValues,
  submitLabel,
  cancelTo,
  loading = false,
  errorMessage,
  onSubmit,
}: AttendanceTestFormProps) {
  const { control, handleSubmit } = useForm<AttendanceTestFormValues>({
    resolver: zodResolver(attendanceTestFormSchema),
    defaultValues,
  });

  const validationOptions = useMemo(
    () => Object.entries(validationStatusLabels).map(([value, label]) => ({ value, label })),
    [],
  );
  const locationOptions = useMemo(
    () => Object.entries(locationStatusLabels).map(([value, label]) => ({ value, label })),
    [],
  );
  const punctualityOptions = useMemo(
    () => Object.entries(punctualityStatusLabels).map(([value, label]) => ({ value, label })),
    [],
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormSection>
        <Stack gap="md">
          <Alert color="yellow" title="Herramienta temporal">
            Esta función es temporal y se utiliza únicamente para validar el modelo antes de integrar
            WhatsApp y Twilio.
          </Alert>

          <FormErrorAlert message={errorMessage} />

          <Controller
            name="operationId"
            control={control}
            render={({ field, fieldState }) => (
              <OperationSearchAutocomplete
                value={field.value || null}
                onChange={(operationId) => field.onChange(operationId ?? "")}
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message}
                required
              />
            )}
          />

          <Controller
            name="employeeId"
            control={control}
            render={({ field, fieldState }) => (
              <EmployeeSearchAutocomplete
                value={field.value || null}
                onChange={(employeeId) => field.onChange(employeeId ?? "")}
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message ?? "Buscá por nombre o teléfono"}
                required
              />
            )}
          />

          <FormGrid>
            <RHFNumberInput
              control={control}
              name="receivedLatitude"
              label="Latitud recibida"
              required
              allowDecimal
              decimalScale={8}
              min={-90}
              max={90}
            />
            <RHFNumberInput
              control={control}
              name="receivedLongitude"
              label="Longitud recibida"
              required
              allowDecimal
              decimalScale={8}
              min={-180}
              max={180}
            />
            <RHFNumberInput
              control={control}
              name="distanceMeters"
              label="Distancia (metros)"
              required
              allowDecimal
              decimalScale={2}
              min={0}
            />
            <RHFSelect
              control={control}
              name="validationStatus"
              label="Validación"
              data={validationOptions}
              required
            />
            <RHFSelect
              control={control}
              name="locationStatus"
              label="Ubicación"
              data={locationOptions}
              required
            />
            <RHFSelect
              control={control}
              name="punctualityStatus"
              label="Puntualidad"
              data={punctualityOptions}
              required
            />
          </FormGrid>

          <RHFDateTimeInput control={control} name="receivedAt" label="Fecha y hora recibida" required />
          <RHFTextInput control={control} name="sourceMessageSid" label="MessageSid (opcional)" />
          <RHFTextarea
            control={control}
            name="validationReason"
            label="Motivo de validación (opcional)"
            minRows={2}
          />

          <FormActions submitLabel={submitLabel} cancelTo={cancelTo} loading={loading} />
        </Stack>
      </FormSection>
    </form>
  );
}
