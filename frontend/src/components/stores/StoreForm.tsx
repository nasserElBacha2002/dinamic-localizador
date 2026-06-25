import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Box,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
} from "@mui/material";
import { Controller, useForm, useWatch } from "react-hook-form";
import { STORE_FORMATS } from "../../constants/store-formats";
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
      <Stack spacing={3} sx={{ width: "100%" }}>
        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            gap: 2,
            alignItems: "start",
          }}
        >
          <Controller
            name="name"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Nombre"
                required
                fullWidth
                value={field.value ?? ""}
                error={Boolean(errors.name)}
                helperText={errors.name?.message}
                InputLabelProps={{ shrink: Boolean(field.value) }}
              />
            )}
          />

          <Controller
            name="storeFormat"
            control={control}
            render={({ field }) => (
              <FormControl fullWidth error={Boolean(errors.storeFormat)}>
                <InputLabel id="store-format-label">Formato</InputLabel>
                <Select
                  labelId="store-format-label"
                  label="Formato"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  inputRef={field.ref}
                >
                  <MenuItem value="">
                    <em>Sin formato</em>
                  </MenuItem>
                  {STORE_FORMATS.map((format) => (
                    <MenuItem key={format} value={format}>
                      {format}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
        </Box>

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
          neighborhood={watchedValues.neighborhood ?? ""}
          locality={watchedValues.locality ?? ""}
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
