import { zodResolver } from "@hookform/resolvers/zod";
import { Stack, Text } from "@mantine/core";
import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  FormActions,
  FormErrorAlert,
  FormGrid,
  FormSection,
  RHFDateTimeInput,
  RHFNumberInput,
  RHFSelect,
  RHFTextarea,
} from "../../design-system";
import {
  createOperationFormSchema,
  operationFormSchema,
  type OperationFormValues,
} from "../../schemas/operation.schema";
import type { OperationStatus } from "../../types/operation";
import { getCurrentDatetimeLocal } from "../../utils/dates";
import { getAllowedStatusOptions, isOperationEditable } from "../../utils/operation-status";
import { operationStatusLabels } from "../../utils/labels";
import { ServiceSearchAutocomplete } from "../services/ServiceSearchAutocomplete";

export const INVENTORY_DETAIL_FORM_ID = "inventory-detail-form";

interface OperationFormProps {
  mode: "create" | "edit";
  defaultValues: OperationFormValues;
  currentStatus?: OperationStatus;
  submitLabel: string;
  cancelTo: string;
  onCancel?: () => void;
  loading?: boolean;
  errorMessage?: string | null;
  onSubmit: (values: OperationFormValues) => Promise<void>;
  embedded?: boolean;
  formId?: string;
  hideActions?: boolean;
}

export function OperationForm({
  mode,
  defaultValues,
  currentStatus = "SCHEDULED",
  submitLabel,
  cancelTo,
  onCancel,
  loading = false,
  errorMessage,
  onSubmit,
  embedded = false,
  formId,
  hideActions = false,
}: OperationFormProps) {
  const validationSchema = useMemo(
    () => (mode === "create" ? createOperationFormSchema : operationFormSchema),
    [mode],
  );

  const { control, handleSubmit, reset } = useForm<OperationFormValues>({
    resolver: zodResolver(validationSchema),
    defaultValues,
  });

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  const statusOptions = useMemo(
    () =>
      mode === "edit"
        ? getAllowedStatusOptions(currentStatus).map((status) => ({
            value: status,
            label: operationStatusLabels[status],
          }))
        : [],
    [currentStatus, mode],
  );

  const storeFieldDisabled = mode === "edit" && !isOperationEditable(currentStatus);
  const minScheduledStart = mode === "create" ? getCurrentDatetimeLocal() : undefined;

  const formContent = (
    <Stack gap="md">
      <FormErrorAlert message={errorMessage} />

      <FormGrid>
        <FormGrid.Full>
          <Controller
            name="serviceId"
            control={control}
            render={({ field, fieldState }) => (
              <ServiceSearchAutocomplete
                value={field.value || null}
                onChange={(serviceId) => field.onChange(serviceId ?? "")}
                activeOnly={mode === "create"}
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message ?? "Buscá por nombre o dirección"}
                disabled={storeFieldDisabled}
                required
              />
            )}
          />
        </FormGrid.Full>
      </FormGrid>

      <Text size="xs" c="dimmed">
        Zona horaria: America/Argentina/Buenos_Aires
      </Text>

      <FormGrid>
        <RHFDateTimeInput
          control={control}
          name="scheduledStart"
          label="Inicio programado"
          required
          min={minScheduledStart}
        />
        <RHFDateTimeInput control={control} name="scheduledEnd" label="Fin programado" />
      </FormGrid>

      <FormGrid>
        <RHFNumberInput
          control={control}
          name="earlyToleranceMinutes"
          label="Tolerancia temprana (minutos)"
          required
          min={0}
          step={1}
        />
        <RHFNumberInput
          control={control}
          name="lateToleranceMinutes"
          label="Tolerancia tardía (minutos)"
          required
          min={0}
          step={1}
        />
      </FormGrid>

      <FormGrid>
        <FormGrid.Full>
          <RHFTextarea control={control} name="notes" label="Notas" minRows={3} />
        </FormGrid.Full>
      </FormGrid>

      {mode === "edit" && statusOptions.length > 0 ? (
        <FormGrid>
          <FormGrid.Full>
            <RHFSelect control={control} name="status" label="Estado" data={statusOptions} />
          </FormGrid.Full>
        </FormGrid>
      ) : null}

      {!hideActions ? (
        <FormActions submitLabel={submitLabel} cancelTo={cancelTo} onCancel={onCancel} loading={loading} />
      ) : null}
    </Stack>
  );

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} noValidate>
      {embedded ? formContent : <FormSection>{formContent}</FormSection>}
    </form>
  );
}
