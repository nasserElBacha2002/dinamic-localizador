import { Alert } from "@mantine/core";
import { FormSection } from "../../../design-system";
import { ManualCoordinatesFields } from "./components/ManualCoordinatesFields";
import { ServiceInteractiveMapPanel } from "./components/LocationMapSection";
import { useLocationPickerState } from "./hooks/useLocationPickerState";
import type { ServiceLocationPickerProps } from "./types";

/**
 * @deprecated Prefer composing `useServiceLocationPicker` with `ServiceForm` two-column layout.
 * Kept for backward compatibility if imported elsewhere.
 */
export function ServiceLocationPicker(props: ServiceLocationPickerProps) {
  const picker = useLocationPickerState(props);

  return (
    <>
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
          onNeighborhoodChange={(value) => picker.handleManualFieldChange({ neighborhood: value })}
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

      <ServiceInteractiveMapPanel
        autocompleteContainerRef={picker.autocompleteContainerRef}
        mapContainerRef={picker.mapContainerRef}
        mapsLoadState={picker.mapsLoadState}
        locationState={picker.locationState}
      />
    </>
  );
}
