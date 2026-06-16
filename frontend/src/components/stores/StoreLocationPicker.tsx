import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UseFormSetValue, UseFormTrigger } from "react-hook-form";
import type { StoreFormValues } from "../../schemas/store.schema";
import { getGoogleMapsApiKey, getGoogleMapsMapId } from "../../utils/google-maps-config";
import { loadGoogleMapsLibraries } from "../../utils/google-maps-loader";
import {
  applyManualCoordinates,
  applyMarkerDrag,
  applyPlaceSelection,
  hasConfirmedLocation,
  locationStateLabel,
  mapGoogleMapsError,
  resolveInitialLocationState,
  type LocationPickerState,
  type StoreLocationFields,
} from "../../utils/store-location";

interface StoreLocationPickerProps {
  isEditMode?: boolean;
  currentName?: string;
  latitude: number;
  longitude: number;
  address?: string;
  googlePlaceId?: string | null;
  allowedRadiusMeters: number;
  setValue: UseFormSetValue<StoreFormValues>;
  trigger: UseFormTrigger<StoreFormValues>;
}

const setValueOptions = { shouldDirty: true, shouldValidate: true } as const;

type MapsLoadState = "loading" | "ready" | "error" | "disabled";

const waitForContainerRefs = async (
  getMapContainer: () => HTMLDivElement | null,
  getAutocompleteContainer: () => HTMLDivElement | null,
  attempts = 40,
): Promise<{ mapContainer: HTMLDivElement; autocompleteContainer: HTMLDivElement } | null> => {
  for (let index = 0; index < attempts; index += 1) {
    const mapContainer = getMapContainer();
    const autocompleteContainer = getAutocompleteContainer();
    if (mapContainer && autocompleteContainer) {
      return { mapContainer, autocompleteContainer };
    }

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  return null;
};

const readLatLng = (position: google.maps.LatLng | google.maps.LatLngLiteral | null | undefined) => {
  if (!position) {
    return null;
  }

  if (typeof (position as google.maps.LatLng).lat === "function") {
    const latLng = position as google.maps.LatLng;
    return { latitude: latLng.lat(), longitude: latLng.lng() };
  }

  const literal = position as google.maps.LatLngLiteral;
  return { latitude: literal.lat, longitude: literal.lng };
};

const readDisplayName = (value: unknown): string | null => {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && "text" in value) {
    const text = (value as { text?: string }).text;
    return text?.trim() ? text : null;
  }

  return null;
};

export function StoreLocationPicker({
  isEditMode = false,
  currentName,
  latitude,
  longitude,
  address = "",
  googlePlaceId = null,
  allowedRadiusMeters,
  setValue,
  trigger,
}: StoreLocationPickerProps) {
  const hasApiKey = Boolean(getGoogleMapsApiKey());
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const autocompleteContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const autocompleteRef = useRef<google.maps.places.PlaceAutocompleteElement | null>(null);
  const cleanupFnsRef = useRef<Array<() => void>>([]);
  const internalUpdateRef = useRef(false);
  const initGenerationRef = useRef(0);
  const initialCenterRef = useRef({
    latitude,
    longitude,
    allowedRadiusMeters,
  });

  const [locationState, setLocationState] = useState<LocationPickerState>(() => {
    if (!hasApiKey) {
      return "ERROR";
    }

    return resolveInitialLocationState({
      isEditMode,
      latitude,
      longitude,
      googlePlaceId,
    });
  });

  const currentFields = useCallback(
    (): StoreLocationFields => ({
      address,
      latitude,
      longitude,
      googlePlaceId,
      allowedRadiusMeters,
      name: currentName,
    }),
    [address, allowedRadiusMeters, currentName, googlePlaceId, latitude, longitude],
  );

  const fieldsRef = useRef(currentFields());
  const currentNameRef = useRef(currentName);

  useEffect(() => {
    fieldsRef.current = currentFields();
    currentNameRef.current = currentName;
  }, [currentFields, currentName]);

  const [mapsLoadState, setMapsLoadState] = useState<MapsLoadState>(() =>
    hasApiKey ? "loading" : "disabled",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(() =>
    hasApiKey ? null : mapGoogleMapsError(new Error("GOOGLE_MAPS_API_KEY_MISSING")).message,
  );

  const applyFieldsToForm = useCallback(
    (fields: StoreLocationFields, nextState: LocationPickerState) => {
      internalUpdateRef.current = true;
      setValue("address", fields.address ?? "", setValueOptions);
      setValue("latitude", fields.latitude, setValueOptions);
      setValue("longitude", fields.longitude, setValueOptions);
      setValue("googlePlaceId", fields.googlePlaceId ?? "", setValueOptions);
      setValue("allowedRadiusMeters", fields.allowedRadiusMeters, setValueOptions);

      if (fields.name && !currentNameRef.current?.trim()) {
        setValue("name", fields.name, setValueOptions);
      }

      setLocationState(nextState);
      setErrorMessage(null);
      void trigger(["address", "latitude", "longitude", "allowedRadiusMeters", "googlePlaceId"]);

      queueMicrotask(() => {
        internalUpdateRef.current = false;
      });
    },
    [setValue, trigger],
  );

  const updateMapVisuals = useCallback((lat: number, lng: number, radius: number) => {
    const center = { lat, lng };
    mapInstanceRef.current?.setCenter(center);
    if (markerRef.current) {
      markerRef.current.position = center;
    }
    circleRef.current?.setCenter(center);
    circleRef.current?.setRadius(radius);
  }, []);

  const registerCleanup = useCallback((cleanup: () => void) => {
    cleanupFnsRef.current.push(cleanup);
  }, []);

  const runCleanup = useCallback(() => {
    for (const cleanup of cleanupFnsRef.current.reverse()) {
      cleanup();
    }
    cleanupFnsRef.current = [];
    mapInstanceRef.current = null;
    markerRef.current = null;
    circleRef.current = null;
    autocompleteRef.current = null;
  }, []);

  useEffect(() => {
    if (!hasApiKey) {
      return;
    }

    const generation = ++initGenerationRef.current;
    let cancelled = false;

    const initialize = async () => {
      try {
        const libraries = await loadGoogleMapsLibraries();
        if (cancelled || generation !== initGenerationRef.current) {
          return;
        }

        const containers = await waitForContainerRefs(
          () => mapContainerRef.current,
          () => autocompleteContainerRef.current,
        );

        if (!containers) {
          throw new Error("GOOGLE_MAPS_CONTAINER_MISSING");
        }

        const { Map, Circle } = libraries.maps;
        const { AdvancedMarkerElement } = libraries.marker;
        const { mapContainer, autocompleteContainer } = containers;
        const center = {
          lat: initialCenterRef.current.latitude,
          lng: initialCenterRef.current.longitude,
        };

        const map = new Map(mapContainer, {
          center,
          zoom: 16,
          mapId: getGoogleMapsMapId(),
          mapTypeControl: false,
          streetViewControl: false,
        });

        const marker = new AdvancedMarkerElement({
          map,
          position: center,
          gmpDraggable: true,
        });

        const circle = new Circle({
          map,
          center,
          radius: initialCenterRef.current.allowedRadiusMeters,
          fillColor: "#1976d2",
          fillOpacity: 0.15,
          strokeColor: "#1976d2",
          strokeOpacity: 0.6,
        });

        const autocomplete = new libraries.places.PlaceAutocompleteElement({});
        autocompleteContainer.replaceChildren(autocomplete);

        const onAutocompleteInput = () => {
          setLocationState((current) =>
            current === "SELECTED" || current === "MANUAL" ? current : "SEARCHING",
          );
        };

        const onAutocompleteSelect = async (event: Event) => {
          const placePrediction = (event as { placePrediction?: { toPlace: () => google.maps.places.Place } })
            .placePrediction;
          if (!placePrediction) {
            return;
          }

          const place = placePrediction.toPlace();

          try {
            await place.fetchFields({
              fields: ["id", "displayName", "formattedAddress", "location"],
            });
          } catch {
            setLocationState("ERROR");
            setErrorMessage("No se pudieron obtener los datos del lugar seleccionado.");
            return;
          }

          const coords = readLatLng(place.location ?? null);
          if (!coords) {
            setLocationState("ERROR");
            setErrorMessage("No se encontraron coordenadas para la dirección seleccionada.");
            return;
          }

          const selection = applyPlaceSelection(
            fieldsRef.current,
            {
              googlePlaceId: place.id ?? "",
              address: place.formattedAddress ?? "",
              displayName: readDisplayName(place.displayName),
              latitude: coords.latitude,
              longitude: coords.longitude,
            },
            currentNameRef.current,
          );

          applyFieldsToForm(selection.fields, selection.state);
          updateMapVisuals(coords.latitude, coords.longitude, selection.fields.allowedRadiusMeters);
        };

        const onMarkerDragEnd = () => {
          const coords = readLatLng(marker.position ?? null);
          if (!coords) {
            return;
          }

          const result = applyMarkerDrag(fieldsRef.current, coords.latitude, coords.longitude);
          if (!result) {
            return;
          }

          applyFieldsToForm(result.fields, result.state);
          updateMapVisuals(coords.latitude, coords.longitude, result.fields.allowedRadiusMeters);
        };

        autocomplete.addEventListener("input", onAutocompleteInput);
        autocomplete.addEventListener("gmp-select", onAutocompleteSelect);
        marker.addListener("dragend", onMarkerDragEnd);

        registerCleanup(() => autocomplete.removeEventListener("input", onAutocompleteInput));
        registerCleanup(() => autocomplete.removeEventListener("gmp-select", onAutocompleteSelect));
        registerCleanup(() => google.maps.event.clearInstanceListeners(marker));
        registerCleanup(() => circle.setMap(null));
        registerCleanup(() => autocomplete.remove());

        mapInstanceRef.current = map;
        markerRef.current = marker;
        circleRef.current = circle;
        autocompleteRef.current = autocomplete;
        setMapsLoadState("ready");
        setErrorMessage(null);
      } catch (error) {
        if (cancelled || generation !== initGenerationRef.current) {
          return;
        }

        const mapped = mapGoogleMapsError(error);
        setMapsLoadState("error");
        setLocationState("ERROR");
        setErrorMessage(mapped.message);
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      runCleanup();
    };
  }, [applyFieldsToForm, hasApiKey, registerCleanup, runCleanup, updateMapVisuals]);

  useEffect(() => {
    if (mapsLoadState !== "ready" || internalUpdateRef.current) {
      return;
    }

    updateMapVisuals(latitude, longitude, allowedRadiusMeters);
  }, [allowedRadiusMeters, latitude, longitude, mapsLoadState, updateMapVisuals]);

  const handleManualAddressChange = (nextAddress: string) => {
    applyFieldsToForm(
      {
        ...currentFields(),
        address: nextAddress,
      },
      locationState === "SELECTED" ? "SELECTED" : locationState === "MANUAL" ? "MANUAL" : "EMPTY",
    );
  };

  const handleManualLatitudeChange = (nextLatitude: number) => {
    const result = applyManualCoordinates(currentFields(), nextLatitude, longitude);
    if (!result) {
      setLocationState("EMPTY");
      setValue("latitude", nextLatitude, setValueOptions);
      return;
    }

    applyFieldsToForm(result.fields, result.state);
    if (mapsLoadState === "ready") {
      updateMapVisuals(result.fields.latitude, result.fields.longitude, result.fields.allowedRadiusMeters);
    }
  };

  const handleManualLongitudeChange = (nextLongitude: number) => {
    const result = applyManualCoordinates(currentFields(), latitude, nextLongitude);
    if (!result) {
      setLocationState("EMPTY");
      setValue("longitude", nextLongitude, setValueOptions);
      return;
    }

    applyFieldsToForm(result.fields, result.state);
    if (mapsLoadState === "ready") {
      updateMapVisuals(result.fields.latitude, result.fields.longitude, result.fields.allowedRadiusMeters);
    }
  };

  const handleRadiusChange = (nextRadius: number) => {
    applyFieldsToForm(
      {
        ...currentFields(),
        allowedRadiusMeters: nextRadius,
      },
      locationState,
    );
    if (mapsLoadState === "ready") {
      circleRef.current?.setRadius(nextRadius);
    }
  };

  const confirmed = hasConfirmedLocation(locationState, latitude, longitude);
  const showGoogleMapsUi = mapsLoadState === "loading" || mapsLoadState === "ready";

  return (
    <Stack spacing={2}>
      {errorMessage ? <Alert severity="warning">{errorMessage}</Alert> : null}

      {showGoogleMapsUi ? (
        <>
          <Box
            ref={autocompleteContainerRef}
            sx={{
              width: "100%",
              minHeight: 56,
              "& gmp-place-autocomplete": {
                width: "100%",
                colorScheme: "light",
              },
            }}
          />
          {mapsLoadState === "loading" ? (
            <Typography variant="body2" color="text.secondary">
              Cargando Google Maps…
            </Typography>
          ) : null}
          <Box
            ref={mapContainerRef}
            sx={{
              width: "100%",
              height: 280,
              borderRadius: 1,
              border: "1px solid",
              borderColor: "divider",
              visibility: mapsLoadState === "ready" ? "visible" : "hidden",
            }}
          />
        </>
      ) : null}

      {locationState === "SEARCHING" ? (
        <Alert severity="info">
          Seleccioná una sugerencia de la lista para confirmar la ubicación. Escribir texto no alcanza.
        </Alert>
      ) : null}

      {confirmed ? (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Chip color="success" label="Ubicación confirmada" size="small" />
                <Typography variant="body2" color="text.secondary">
                  {locationStateLabel[locationState]}
                </Typography>
              </Stack>
              <Typography>Dirección: {address || "—"}</Typography>
              <Typography>
                Coordenadas: {latitude.toFixed(6)}, {longitude.toFixed(6)}
              </Typography>
              <Typography>Radio permitido: {allowedRadiusMeters} m</Typography>
              {googlePlaceId ? <Typography variant="body2">Place ID: {googlePlaceId}</Typography> : null}
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      <Typography variant="subtitle2">Ubicación manual</Typography>
      <TextField
        label="Dirección"
        fullWidth
        value={address}
        onChange={(event) => handleManualAddressChange(event.target.value)}
      />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          label="Latitud"
          type="number"
          fullWidth
          inputProps={{ step: "any" }}
          value={latitude}
          onChange={(event) => handleManualLatitudeChange(Number(event.target.value))}
        />
        <TextField
          label="Longitud"
          type="number"
          fullWidth
          inputProps={{ step: "any" }}
          value={longitude}
          onChange={(event) => handleManualLongitudeChange(Number(event.target.value))}
        />
      </Stack>
      <TextField
        label="Radio permitido (metros)"
        type="number"
        fullWidth
        value={allowedRadiusMeters}
        onChange={(event) => handleRadiusChange(Number(event.target.value))}
      />
    </Stack>
  );
}
