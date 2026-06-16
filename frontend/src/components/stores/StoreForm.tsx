import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, FormControlLabel, Stack, Switch, TextField } from "@mui/material";
import { Controller, useForm, useWatch } from "react-hook-form";
import { storeFormSchema, type StoreFormValues } from "../../schemas/store.schema";
import { FormActions } from "../common/FormActions";
import { StoreLocationPicker } from "./StoreLocationPicker";

interface StoreFormProps {
  defaultValues: StoreFormValues;
  submitLabel: string;
  cancelTo: string;
  loading?: boolean;
  errorMessage?: string | null;
  isEditMode?: boolean;
  onSubmit: (values: StoreFormValues) => Promise<void>;
}

export function StoreForm({
  defaultValues,
  submitLabel,
  cancelTo,
  loading = false,
  errorMessage,
  isEditMode = false,
  onSubmit,
}: StoreFormProps) {
  const {
    register,
    control,
    handleSubmit,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<StoreFormValues>({
    resolver: zodResolver(storeFormSchema),
    defaultValues,
  });

  const watchedValues = useWatch({ control });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack spacing={2} maxWidth={720}>
        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

        <TextField
          label="Nombre"
          required
          fullWidth
          error={Boolean(errors.name)}
          helperText={errors.name?.message}
          {...register("name")}
        />

        <Controller
          name="active"
          control={control}
          render={({ field }) => (
            <FormControlLabel
              control={<Switch checked={field.value} onChange={field.onChange} inputRef={field.ref} />}
              label="Activa"
            />
          )}
        />

        <StoreLocationPicker
          isEditMode={isEditMode}
          currentName={watchedValues.name}
          latitude={watchedValues.latitude ?? defaultValues.latitude}
          longitude={watchedValues.longitude ?? defaultValues.longitude}
          address={watchedValues.address ?? ""}
          googlePlaceId={watchedValues.googlePlaceId ?? null}
          allowedRadiusMeters={watchedValues.allowedRadiusMeters ?? defaultValues.allowedRadiusMeters}
          setValue={setValue}
          trigger={trigger}
        />
      </Stack>

      <FormActions submitLabel={submitLabel} cancelTo={cancelTo} loading={loading} />
    </form>
  );
}
