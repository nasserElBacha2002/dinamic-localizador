import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Stack, Text } from "@mantine/core";
import { useForm, Controller } from "react-hook-form";
import { attendanceTestFormSchema, type AttendanceTestFormValues } from "../../schemas/attendance.schema";
import {
  FormActions,
  FormErrorAlert,
  FormGrid,
  FormSection,
  RHFDateTimeInput,
  RHFNumberInput,
  RHFTextInput,
} from "../../design-system";
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

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormSection>
        <Stack gap="md">
          <Alert color="yellow" title="Herramienta de prueba">
            Solo se envían coordenadas y hora. La distancia y los estados de validación los calcula el
            servidor.
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
          </FormGrid>

          <RHFDateTimeInput control={control} name="receivedAt" label="Fecha y hora recibida" required />
          <RHFTextInput control={control} name="sourceMessageSid" label="MessageSid (opcional)" />
          <Text size="sm" c="dimmed">
            Distancia, geocerca y puntualidad: calculadas en el backend (no editables).
          </Text>

          <FormActions submitLabel={submitLabel} cancelTo={cancelTo} loading={loading} />
        </Stack>
      </FormSection>
    </form>
  );
}
