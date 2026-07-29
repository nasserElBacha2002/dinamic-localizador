import { Badge, Group, Stack, Text } from "@mantine/core";
import { FormSection } from "../../../../design-system";
import { LocationMapCanvas } from "./LocationMapSection";
import { useServiceLocationMapView } from "../hooks/useServiceLocationMapView";
import classes from "./location-map-section.module.css";

export interface ServiceLocationMapViewProps {
  latitude: number;
  longitude: number;
  allowedRadiusMeters: number;
}

/**
 * Read-only service map for detail pages.
 * Reuses the same canvas styles as the interactive picker; no autocomplete or drag.
 */
export function ServiceLocationMapView({
  latitude,
  longitude,
  allowedRadiusMeters,
}: ServiceLocationMapViewProps) {
  const { mapContainerRef, mapsLoadState, errorMessage } = useServiceLocationMapView({
    latitude,
    longitude,
    allowedRadiusMeters,
  });

  return (
    <FormSection
      title="Ubicación"
      description="Marcador fijo y radio de validación. La edición de coordenadas está en la pantalla de edición."
    >
      <Stack gap="md" className={classes.mapPanel} data-testid="service-location-map-view">
        {errorMessage && mapsLoadState !== "ready" ? (
          <Text size="sm" c="dimmed">
            {errorMessage}
          </Text>
        ) : null}
        <LocationMapCanvas
          mapContainerRef={mapContainerRef}
          mapsLoadState={mapsLoadState}
          locationState="SELECTED"
        />
        <Group gap="xs">
          <Badge variant="light" color="red">
            Centro del servicio
          </Badge>
          <Badge variant="light" color="blue">
            Área validada
          </Badge>
        </Group>
      </Stack>
    </FormSection>
  );
}
