import { zodResolver } from "@hookform/resolvers/zod";
import { Stack } from "@mantine/core";
import { useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { STORE_FORMATS } from "../../constants/store-formats";
import {
  FormActions,
  FormErrorAlert,
  FormGrid,
  FormSection,
  RHFSelect,
  RHFSwitch,
  RHFTextInput,
} from "../../design-system";
import { storeFormSchema, type StoreFormValues } from "../../schemas/store.schema";
import { StoreLocationPicker } from "./location-picker/StoreLocationPicker";

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
  const { control, handleSubmit, setValue, trigger } = useForm<StoreFormValues>({
    resolver: zodResolver(storeFormSchema),
    defaultValues,
  });

  const watchedValues = useWatch({ control });

  const storeFormatOptions = useMemo(
    () => [
      { value: "", label: "Sin formato" },
      ...STORE_FORMATS.map((format) => ({ value: format, label: format })),
    ],
    [],
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormSection>
        <Stack gap="lg">
          <FormErrorAlert message={errorMessage} />

          <FormGrid>
            <RHFTextInput control={control} name="name" label="Nombre" required />
            <RHFSelect
              control={control}
              name="storeFormat"
              label="Formato"
              data={storeFormatOptions}
              clearable
            />
          </FormGrid>

          <RHFSwitch control={control} name="active" label="Activa" />

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

          <FormActions submitLabel={submitLabel} cancelTo={cancelTo} loading={loading} />
        </Stack>
      </FormSection>
    </form>
  );
}
