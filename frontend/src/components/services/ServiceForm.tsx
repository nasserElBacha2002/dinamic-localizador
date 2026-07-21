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
import { serviceFormSchema, type ServiceFormValues } from "../../schemas/service.schema";
import { ManualCoordinatesFields } from "./location-picker/components/ManualCoordinatesFields";
import { ServiceInteractiveMapPanel } from "./location-picker/components/LocationMapSection";
import { useLocationPickerState } from "./location-picker/hooks/useLocationPickerState";
import classes from "./service-form-layout.module.css";

export const SERVICE_FORM_ID = "service-form";

interface ServiceFormProps {
  defaultValues: ServiceFormValues;
  submitLabel: string;
  cancelTo: string;
  onCancel?: () => void;
  loading?: boolean;
  errorMessage?: string | null;
  isEditMode?: boolean;
  onSubmit: (values: ServiceFormValues) => Promise<void>;
  formId?: string;
  showBottomActions?: boolean;
}

export function ServiceForm({
  defaultValues,
  submitLabel,
  cancelTo,
  onCancel,
  loading = false,
  errorMessage,
  isEditMode = false,
  onSubmit,
  formId = SERVICE_FORM_ID,
  showBottomActions = true,
}: ServiceFormProps) {
  const { control, handleSubmit, setValue, trigger } = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
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

  const serviceFormatOptions = useMemo(() => {
    const activeOptions = locationTypes
      .filter((type) => type.isActive)
      .map((type) => ({ value: type.code, label: type.name }));

    const currentFormat = watchedValues.serviceFormat ?? defaultValues.serviceFormat ?? "";
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
  }, [defaultValues.serviceFormat, locationTypes, watchedValues.serviceFormat]);

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormErrorAlert message={errorMessage} />

      <Box className={classes.serviceFormLayout} mt="md">
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
                name="serviceFormat"
                label="Formato"
                data={serviceFormatOptions}
                clearable
              />
            </FormGrid>
            <Box mt="md">
              <RHFSwitch control={control} name="active" label="Activa" />
            </Box>
          </FormSection>
        </Box>

        <Box className={classes.mapSection}>
          <ServiceInteractiveMapPanel
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
