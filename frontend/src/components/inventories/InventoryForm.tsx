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
import { Controller, useForm } from "react-hook-form";
import { inventoryFormSchema, type InventoryFormValues } from "../../schemas/inventory.schema";
import type { InventoryStatus } from "../../types/inventory";
import type { Store } from "../../types/store";
import { getAllowedStatusOptions, isInventoryEditable } from "../../utils/inventory-status";
import { inventoryStatusLabels } from "../../utils/labels";
import { FormActions } from "../common/FormActions";

interface InventoryFormProps {
  mode: "create" | "edit";
  stores: Store[];
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
  stores,
  defaultValues,
  currentStatus = "SCHEDULED",
  submitLabel,
  cancelTo,
  loading = false,
  errorMessage,
  onSubmit,
}: InventoryFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<InventoryFormValues>({
    resolver: zodResolver(inventoryFormSchema),
    defaultValues,
  });

  const activeStores = stores.filter((store) => store.active);
  const statusOptions = mode === "edit" ? getAllowedStatusOptions(currentStatus) : [];

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack spacing={2} maxWidth={640}>
        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

        <Controller
          name="storeId"
          control={control}
          render={({ field }) => (
            <FormControl fullWidth required error={Boolean(errors.storeId)}>
              <InputLabel id="store-select-label">Tienda</InputLabel>
              <Select
                {...field}
                labelId="store-select-label"
                label="Tienda"
                disabled={mode === "edit" && !isInventoryEditable(currentStatus)}
              >
                {(mode === "create" ? activeStores : stores).map((store) => (
                  <MenuItem key={store.id} value={store.id} disabled={mode === "create" && !store.active}>
                    {store.name}
                    {!store.active ? " (inactiva)" : ""}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        />

        <TextField
          label="Inicio programado"
          type="datetime-local"
          required
          fullWidth
          InputLabelProps={{ shrink: true }}
          error={Boolean(errors.scheduledStart)}
          helperText={errors.scheduledStart?.message ?? "Zona horaria: America/Argentina/Buenos_Aires"}
          {...register("scheduledStart")}
        />

        <TextField
          label="Fin programado"
          type="datetime-local"
          fullWidth
          InputLabelProps={{ shrink: true }}
          error={Boolean(errors.scheduledEnd)}
          helperText={errors.scheduledEnd?.message}
          {...register("scheduledEnd")}
        />

        <TextField
          label="Tolerancia temprana (minutos)"
          type="number"
          required
          fullWidth
          error={Boolean(errors.earlyToleranceMinutes)}
          helperText={errors.earlyToleranceMinutes?.message}
          {...register("earlyToleranceMinutes", { valueAsNumber: true })}
        />

        <TextField
          label="Tolerancia tardía (minutos)"
          type="number"
          required
          fullWidth
          error={Boolean(errors.lateToleranceMinutes)}
          helperText={errors.lateToleranceMinutes?.message}
          {...register("lateToleranceMinutes", { valueAsNumber: true })}
        />

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
