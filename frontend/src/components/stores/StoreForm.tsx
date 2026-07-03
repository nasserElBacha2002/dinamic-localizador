import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Box } from "@mantine/core";
import { useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import {
  FormActions,
  FormErrorAlert,
  FormGrid,
  FormSection,
  RHFSelect,
  RHFSwitch,
  RHFTextInput,
} from "../../design-system";
import { useCompanyLocationTypes } from "../../hooks/useCompanyLocationTypes";
import { storeFormSchema, type StoreFormValues } from "../../schemas/store.schema";
import { ManualCoordinatesFields } from "./location-picker/components/ManualCoordinatesFields";
import { StoreInteractiveMapPanel } from "./location-picker/components/LocationMapSection";
import { useLocationPickerState } from "./location-picker/hooks/useLocationPickerState";
import classes from "./store-form-layout.module.css";

export const STORE_FORM_ID = "store-form";

interface StoreFormProps {
  defaultValues: StoreFormValues;
  submitLabel: string;
  cancelTo: string;
  onCancel?: () => void;
  loading?: boolean;
  errorMessage?: string | null;
  isEditMode?: boolean;
  onSubmit: (values: StoreFormValues) => Promise<void>;
  formId?: string;
  showBottomActions?: boolean;
}

export function StoreForm({
  defaultValues,
  submitLabel,
  cancelTo,
  onCancel,
  loading = false,
  errorMessage,
  isEditMode = false,
  onSubmit,
  formId = STORE_FORM_ID,
  showBottomActions = true,
}: StoreFormProps) {
  const { control, handleSubmit, setValue, trigger } = useForm<StoreFormValues>({
    resolver: zodResolver(storeFormSchema),
    defaultValues,
  });

  const watchedValues = useWatch({ control });
  const { data: locationTypes = [] } = useCompanyLocationTypes(false);

  const picker = useLocationPickerState({
    isEditMode,
    currentName: watchedValues.name,
    latitude: watchedValues.latitude ?? defaultValues.latitude,
    longitude: watchedValues.longitude ?? defaultValues.longitude,
    address: watchedValues.address ?? "",
    neighborhood: watchedValues.neighborhood ?? "",
    locality: watchedValues.locality ?? "",
    googlePlaceId: watchedValues.googlePlaceId ?? null,
    allowedRadiusMeters: watchedValues.allowedRadiusMeters ?? defaultValues.allowedRadiusMeters,
    setValue,
    trigger,
  });

  const storeFormatOptions = useMemo(() => {
    const activeOptions = locationTypes
      .filter((type) => type.isActive)
      .map((type) => ({ value: type.code, label: type.name }));

    const currentFormat = watchedValues.storeFormat ?? defaultValues.storeFormat ?? "";
    if (
      currentFormat &&
      !activeOptions.some((option) => option.value === currentFormat)
    ) {
      const assigned = locationTypes.find((type) => type.code === currentFormat);
      activeOptions.unshift({
        value: currentFormat,
        label: assigned?.name ? `${assigned.name} (inactivo)` : `${currentFormat} (inactivo)`,
      });
    }

    return [{ value: "", label: "Sin tipo" }, ...activeOptions];
  }, [defaultValues.storeFormat, locationTypes, watchedValues.storeFormat]);

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormErrorAlert message={errorMessage} />

      <Box className={classes.storeFormLayout} mt="md">
        <Box className={classes.infoSection}>
          <FormSection
            title="Información general"
            description="Datos principales de la ubicación."
          >
            <FormGrid>
              <RHFTextInput
                control={control}
                name="name"
                label="Nombre de la ubicación"
                required
              />
              <RHFSelect
                control={control}
                name="storeFormat"
                label="Tipo de ubicación / servicio"
                data={storeFormatOptions}
                clearable
              />
            </FormGrid>
            <Box mt="md">
              <RHFSwitch control={control} name="active" label="Activa" />
            </Box>
          </FormSection>
        </Box>

        <Box className={classes.mapSection}>
          <StoreInteractiveMapPanel
            autocompleteContainerRef={picker.autocompleteContainerRef}
            mapContainerRef={picker.mapContainerRef}
            mapsLoadState={picker.mapsLoadState}
            locationState={picker.locationState}
          />
        </Box>

        <Box className={classes.geoSection}>
          <FormSection
            title="Geolocalización"
            description="Coordenadas y radio usados para validar la asistencia por WhatsApp."
          >
            <ManualCoordinatesFields
              address={picker.address}
              neighborhood={picker.neighborhood}
              locality={picker.locality}
              latitude={picker.latitude}
              longitude={picker.longitude}
              allowedRadiusMeters={picker.allowedRadiusMeters}
              onAddressChange={(value) => picker.handleManualFieldChange({ address: value })}
              onNeighborhoodChange={(value) =>
                picker.handleManualFieldChange({ neighborhood: value })
              }
              onLocalityChange={(value) => picker.handleManualFieldChange({ locality: value })}
              onLatitudeChange={picker.handleManualLatitudeChange}
              onLongitudeChange={picker.handleManualLongitudeChange}
              onRadiusChange={picker.handleRadiusChange}
            />
            {picker.errorMessage ? (
              <Alert color="yellow" mt="md">
                {picker.errorMessage}
              </Alert>
            ) : null}
          </FormSection>
        </Box>

        {showBottomActions ? (
          <Box className={classes.actionsSection} hiddenFrom="lg">
            <FormActions submitLabel={submitLabel} cancelTo={cancelTo} onCancel={onCancel} loading={loading} />
          </Box>
        ) : null}
      </Box>
    </form>
  );
}
