import { Alert, Badge, Box, Group, Input, Paper, Stack, Text } from "@mantine/core";
import type { RefObject } from "react";
import { FormSection } from "../../../../design-system";
import type { MapsLoadState } from "../types";
import type { LocationPickerState } from "../../../../utils/store-location";
import classes from "./location-map-section.module.css";

type LocationAddressSearchProps = {
  autocompleteContainerRef: RefObject<HTMLDivElement | null>;
  mapsLoadState: MapsLoadState;
};

export function LocationAddressSearch({
  autocompleteContainerRef,
  mapsLoadState,
}: LocationAddressSearchProps) {
  const showGoogleMapsUi = mapsLoadState === "loading" || mapsLoadState === "ready";

  if (!showGoogleMapsUi) {
    return null;
  }

  return (
    <Input.Wrapper
      label="Buscar dirección"
      description="Seleccioná una sugerencia de Google Maps para confirmar la ubicación."
    >
      <Box ref={autocompleteContainerRef} className={classes.searchHost} />
      {mapsLoadState === "loading" ? (
        <Text size="sm" c="dimmed" mt="xs">
          Cargando Google Maps…
        </Text>
      ) : null}
    </Input.Wrapper>
  );
}

type LocationMapCanvasProps = {
  mapContainerRef: RefObject<HTMLDivElement | null>;
  mapsLoadState: MapsLoadState;
  locationState: LocationPickerState;
};

export function LocationMapCanvas({
  mapContainerRef,
  mapsLoadState,
  locationState,
}: LocationMapCanvasProps) {
  const showGoogleMapsUi = mapsLoadState === "loading" || mapsLoadState === "ready";

  if (!showGoogleMapsUi) {
    return null;
  }

  return (
    <Paper withBorder radius="md" p={0} style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <Box
        ref={mapContainerRef}
        className={classes.mapCanvas}
        style={{ visibility: mapsLoadState === "ready" ? "visible" : "hidden" }}
      />
      {locationState === "SEARCHING" ? (
        <Alert color="blue" m="sm" mt={0}>
          Seleccioná una sugerencia de la lista para confirmar la ubicación. Escribir texto no alcanza.
        </Alert>
      ) : null}
    </Paper>
  );
}

type StoreInteractiveMapPanelProps = LocationAddressSearchProps & LocationMapCanvasProps;

export function StoreInteractiveMapPanel({
  autocompleteContainerRef,
  mapContainerRef,
  mapsLoadState,
  locationState,
}: StoreInteractiveMapPanelProps) {
  return (
    <FormSection
      title="Mapa interactivo"
      description="Arrastrá el marcador o buscá una dirección para ajustar la ubicación."
    >
      <Stack gap="md" className={classes.mapPanel}>
        <LocationAddressSearch
          autocompleteContainerRef={autocompleteContainerRef}
          mapsLoadState={mapsLoadState}
        />
        <LocationMapCanvas
          mapContainerRef={mapContainerRef}
          mapsLoadState={mapsLoadState}
          locationState={locationState}
        />
        <Group gap="xs">
          <Badge variant="light" color="red">
            Centro tienda
          </Badge>
          <Badge variant="light" color="blue">
            Área validada
          </Badge>
        </Group>
      </Stack>
    </FormSection>
  );
}

/** @deprecated Use StoreInteractiveMapPanel or LocationAddressSearch + LocationMapCanvas. */
export function LocationMapSection(props: StoreInteractiveMapPanelProps) {
  return <StoreInteractiveMapPanel {...props} />;
}
