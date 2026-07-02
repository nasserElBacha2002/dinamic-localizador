import { Alert, Stack } from "@mantine/core";
import { ManualCoordinatesFields } from "./components/ManualCoordinatesFields";
import { LocationMapSection, LocationPickerLayout } from "./components/LocationMapSection";
import { useLocationPickerState } from "./hooks/useLocationPickerState";
import type { StoreLocationPickerProps } from "./types";

export function StoreLocationPicker(props: StoreLocationPickerProps) {
  const picker = useLocationPickerState(props);

  return (
    <Stack gap="md" w="100%">
      {picker.errorMessage ? <Alert color="yellow">{picker.errorMessage}</Alert> : null}

      <LocationPickerLayout>
        <Stack gap="md" style={{ minWidth: 0, height: "100%" }}>
          <LocationMapSection
            mapContainerRef={picker.mapContainerRef}
            autocompleteContainerRef={picker.autocompleteContainerRef}
            mapsLoadState={picker.mapsLoadState}
            locationState={picker.locationState}
          />
        </Stack>

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
      </LocationPickerLayout>
    </Stack>
  );
}
