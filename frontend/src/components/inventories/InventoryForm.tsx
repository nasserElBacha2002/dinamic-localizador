import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  createInventoryFormSchema,
  inventoryFormSchema,
  type InventoryFormValues,
} from "../../schemas/inventory.schema";
import type { InventoryStatus } from "../../types/inventory";
import { getCurrentDatetimeLocal } from "../../utils/dates";
import { getAllowedStatusOptions, isInventoryEditable } from "../../utils/inventory-status";
import { inventoryStatusLabels } from "../../utils/labels";
import { FormActions } from "../common/FormActions";
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

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<InventoryFormValues>({
    resolver: zodResolver(validationSchema),
    defaultValues,
  });

  const statusOptions = mode === "edit" ? getAllowedStatusOptions(currentStatus) : [];
  const storeFieldDisabled = mode === "edit" && !isInventoryEditable(currentStatus);

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack spacing={2} maxWidth={720}>
        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

        <Controller
          name="storeId"
          control={control}
          render={({ field }) => (
            <StoreSearchAutocomplete
              value={field.value || null}
              onChange={(storeId) => field.onChange(storeId ?? "")}
              activeOnly={mode === "create"}
              error={Boolean(errors.storeId)}
              helperText={errors.storeId?.message ?? "Buscá por nombre o dirección"}
              disabled={storeFieldDisabled}
              required
            />
          )}
        />

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            label="Inicio programado"
            type="datetime-local"
            required
            fullWidth
            sx={{ flex: 1 }}
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: mode === "create" ? getCurrentDatetimeLocal() : undefined }}
            error={Boolean(errors.scheduledStart)}
            helperText={errors.scheduledStart?.message ?? "Zona horaria: America/Argentina/Buenos_Aires"}
            {...register("scheduledStart")}
          />

          <TextField
            label="Fin programado"
            type="datetime-local"
            fullWidth
            sx={{ flex: 1 }}
            InputLabelProps={{ shrink: true }}
            error={Boolean(errors.scheduledEnd)}
            helperText={errors.scheduledEnd?.message}
            {...register("scheduledEnd")}
          />
        </Stack>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            label="Tolerancia temprana (minutos)"
            type="number"
            required
            fullWidth
            sx={{ flex: 1 }}
            error={Boolean(errors.earlyToleranceMinutes)}
            helperText={errors.earlyToleranceMinutes?.message}
            {...register("earlyToleranceMinutes", { valueAsNumber: true })}
          />

          <TextField
            label="Tolerancia tardía (minutos)"
            type="number"
            required
            fullWidth
            sx={{ flex: 1 }}
            error={Boolean(errors.lateToleranceMinutes)}
            helperText={errors.lateToleranceMinutes?.message}
            {...register("lateToleranceMinutes", { valueAsNumber: true })}
          />
        </Stack>

        <TextField
          label="Notas"
          fullWidth
          multiline
          minRows={3}
          error={Boolean(errors.notes)}
          helperText={errors.notes?.message}
          {...register("notes")}
        />

        {mode === "edit" && statusOptions.length > 0 ? (
          <Controller
            name="status"
            control={control}
            render={({ field }) => (
              <FormControl fullWidth>
                <InputLabel id="status-select-label">Estado</InputLabel>
                <Select {...field} labelId="status-select-label" label="Estado">
                  {statusOptions.map((status) => (
                    <MenuItem key={status} value={status}>
                      {inventoryStatusLabels[status]}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
        ) : null}

        <FormActions submitLabel={submitLabel} cancelTo={cancelTo} loading={loading} />
      </Stack>
    </form>
  );
}
