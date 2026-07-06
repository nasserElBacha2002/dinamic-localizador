import { useCallback, useEffect, useRef, useState } from "react";
import { getGoogleMapsApiKey, getGoogleMapsMapId } from "../../../../utils/google-maps-config";
import { loadGoogleMapsLibraries } from "../../../../utils/google-maps-loader";
import {
  applyManualCoordinates,
  applyMarkerDrag,
  applyPlaceSelection,
  mapGoogleMapsError,
  parseGoogleAddressComponents,
  resolveInitialLocationState,
  type LocationPickerState,
  type ServiceLocationFields,
} from "../../../../utils/service-location";
import type { MapsLoadState, ServiceLocationPickerProps } from "../types";
import { setValueOptions } from "../types";
import {
  readAddressComponents,
  readDisplayName,
  readLatLng,
  resolveManualState,
  waitForContainerRefs,
} from "../utils";

export function useLocationPickerState({
  isEditMode = false,
  currentName,
  latitude,
  longitude,
  address = "",
  neighborhood = "",
  locality = "",
  googlePlaceId = null,
  allowedRadiusMeters,
  setValue,
  trigger,
}: ServiceLocationPickerProps) {
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
    (): ServiceLocationFields => ({
      address,
      neighborhood,
      locality,
      latitude,
      longitude,
      googlePlaceId,
      allowedRadiusMeters,
      name: currentName,
    }),
    [address, allowedRadiusMeters, neighborhood, currentName, googlePlaceId, latitude, locality, longitude],
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
    (fields: ServiceLocationFields, nextState: LocationPickerState) => {
      internalUpdateRef.current = true;
      setValue("address", fields.address ?? "", setValueOptions);
      setValue("neighborhood", fields.neighborhood ?? "", setValueOptions);
      setValue("locality", fields.locality ?? "", setValueOptions);
      setValue("latitude", fields.latitude, setValueOptions);
      setValue("longitude", fields.longitude, setValueOptions);
      setValue("googlePlaceId", fields.googlePlaceId ?? "", setValueOptions);
      setValue("allowedRadiusMeters", fields.allowedRadiusMeters, setValueOptions);

      if (fields.name && !currentNameRef.current?.trim()) {
        setValue("name", fields.name, setValueOptions);
      }

      setLocationState(nextState);
      setErrorMessage(null);
      void trigger([
        "address",
        "neighborhood",
        "locality",
        "latitude",
        "longitude",
        "allowedRadiusMeters",
        "googlePlaceId",
      ]);

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
              fields: ["id", "displayName", "formattedAddress", "location", "addressComponents"],
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

          const parsedAddress = parseGoogleAddressComponents(
            place.formattedAddress ?? "",
            readAddressComponents(place),
          );

          const selection = applyPlaceSelection(
            fieldsRef.current,
            {
              googlePlaceId: place.id ?? "",
              address: parsedAddress.address,
              neighborhood: parsedAddress.neighborhood,
              locality: parsedAddress.locality,
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

  const handleManualFieldChange = (
    patch: Partial<Pick<ServiceLocationFields, "address" | "neighborhood" | "locality">>,
  ) => {
    applyFieldsToForm(
      {
        ...currentFields(),
        ...patch,
      },
      resolveManualState(locationState),
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

  return {
    mapContainerRef,
    autocompleteContainerRef,
    mapsLoadState,
    locationState,
    errorMessage,
    address,
    neighborhood,
    locality,
    latitude,
    longitude,
    allowedRadiusMeters,
    handleManualFieldChange,
    handleManualLatitudeChange,
    handleManualLongitudeChange,
    handleRadiusChange,
  };
}
