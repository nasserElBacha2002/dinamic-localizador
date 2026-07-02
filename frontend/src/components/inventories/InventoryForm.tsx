import { zodResolver } from "@hookform/resolvers/zod";
import { Stack } from "@mantine/core";
import { useMemo } from "react";
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
  createInventoryFormSchema,
  inventoryFormSchema,
  type InventoryFormValues,
} from "../../schemas/inventory.schema";
import type { InventoryStatus } from "../../types/inventory";
import { getCurrentDatetimeLocal } from "../../utils/dates";
import { getAllowedStatusOptions, isInventoryEditable } from "../../utils/inventory-status";
import { inventoryStatusLabels } from "../../utils/labels";
import { StoreSearchAutocomplete } from "../stores/StoreSearchAutocomplete";

interface InventoryFormProps {
  mode: "create" | "edit";
  defaultValues: InventoryFormValues;
  currentStatus?: InventoryStatus;
  submitLabel: string;
  cancelTo: string;
  loading?: boolean;
  errorMessage?: string | null;
  onSubmit: (values: InventoryFormValues) => Promise<void>;
}

export function InventoryForm({
  mode,
  defaultValues,
  currentStatus = "SCHEDULED",
  submitLabel,
  cancelTo,
  loading = false,
  errorMessage,
  onSubmit,
}: InventoryFormProps) {
  const validationSchema = useMemo(
    () => (mode === "create" ? createInventoryFormSchema : inventoryFormSchema),
    [mode],
  );

  const { control, handleSubmit } = useForm<InventoryFormValues>({
    resolver: zodResolver(validationSchema),
    defaultValues,
  });

  const statusOptions = useMemo(
    () =>
      mode === "edit"
        ? getAllowedStatusOptions(currentStatus).map((status) => ({
            value: status,
            label: inventoryStatusLabels[status],
          }))
        : [],
    [currentStatus, mode],
  );

  const storeFieldDisabled = mode === "edit" && !isInventoryEditable(currentStatus);
  const minScheduledStart = mode === "create" ? getCurrentDatetimeLocal() : undefined;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormSection>
        <Stack gap="md">
          <FormErrorAlert message={errorMessage} />

          <Controller
            name="storeId"
            control={control}
            render={({ field, fieldState }) => (
              <StoreSearchAutocomplete
                value={field.value || null}
                onChange={(storeId) => field.onChange(storeId ?? "")}
                activeOnly={mode === "create"}
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message ?? "Buscá por nombre o dirección"}
                disabled={storeFieldDisabled}
                required
              />
            )}
          />

          <FormGrid>
            <RHFDateTimeInput
              control={control}
              name="scheduledStart"
              label="Inicio programado"
              description="Zona horaria: America/Argentina/Buenos_Aires"
              required
              min={minScheduledStart}
            />
            <RHFDateTimeInput control={control} name="scheduledEnd" label="Fin programado" />
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

          <RHFTextarea control={control} name="notes" label="Notas" minRows={3} />

          {mode === "edit" && statusOptions.length > 0 ? (
            <RHFSelect control={control} name="status" label="Estado" data={statusOptions} />
          ) : null}

          <FormActions submitLabel={submitLabel} cancelTo={cancelTo} loading={loading} />
        </Stack>
      </FormSection>
    </form>
  );
}
