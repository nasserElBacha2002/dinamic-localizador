import { useEffect, useRef, useState } from "react";
import { getGoogleMapsApiKey, getGoogleMapsMapId } from "../../../../utils/google-maps-config";
import { loadGoogleMapsLibraries } from "../../../../utils/google-maps-loader";
import { mapGoogleMapsError } from "../../../../utils/service-location";
import type { MapsLoadState } from "../types";
import { waitForMapContainerRef } from "../utils";

export interface UseServiceLocationMapViewOptions {
  latitude: number;
  longitude: number;
  allowedRadiusMeters: number;
}

/**
 * Read-only map: marker + radius circle, no drag, no Places autocomplete, no form writes.
 */
export function useServiceLocationMapView({
  latitude,
  longitude,
  allowedRadiusMeters,
}: UseServiceLocationMapViewOptions) {
  const hasApiKey = Boolean(getGoogleMapsApiKey());
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const cleanupFnsRef = useRef<Array<() => void>>([]);
  const initGenerationRef = useRef(0);
  const centerRef = useRef({ latitude, longitude, allowedRadiusMeters });

  useEffect(() => {
    centerRef.current = { latitude, longitude, allowedRadiusMeters };
  }, [allowedRadiusMeters, latitude, longitude]);

  const [mapsLoadState, setMapsLoadState] = useState<MapsLoadState>(() =>
    hasApiKey ? "loading" : "disabled",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(() =>
    hasApiKey ? null : mapGoogleMapsError(new Error("GOOGLE_MAPS_API_KEY_MISSING")).message,
  );

  useEffect(() => {
    if (!hasApiKey) {
      return;
    }

    const generation = ++initGenerationRef.current;
    let cancelled = false;

    const runCleanup = () => {
      for (const cleanup of cleanupFnsRef.current.splice(0)) {
        cleanup();
      }
      mapInstanceRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };

    const initialize = async () => {
      try {
        const libraries = await loadGoogleMapsLibraries();
        if (cancelled || generation !== initGenerationRef.current) {
          return;
        }

        const mapContainer = await waitForMapContainerRef(() => mapContainerRef.current);
        if (!mapContainer) {
          throw new Error("GOOGLE_MAPS_CONTAINER_MISSING");
        }

        const { Map, Circle } = libraries.maps;
        const { AdvancedMarkerElement } = libraries.marker;
        const initial = centerRef.current;
        const center = { lat: initial.latitude, lng: initial.longitude };

        const map = new Map(mapContainer, {
          center,
          zoom: 16,
          mapId: getGoogleMapsMapId(),
          mapTypeControl: false,
          streetViewControl: false,
          gestureHandling: "cooperative",
        });

        const marker = new AdvancedMarkerElement({
          map,
          position: center,
          gmpDraggable: false,
        });

        const circle = new Circle({
          map,
          center,
          radius: initial.allowedRadiusMeters,
          fillColor: "#1976d2",
          fillOpacity: 0.15,
          strokeColor: "#1976d2",
          strokeOpacity: 0.6,
          clickable: false,
        });

        cleanupFnsRef.current.push(() => circle.setMap(null));
        cleanupFnsRef.current.push(() => {
          marker.map = null;
        });

        mapInstanceRef.current = map;
        markerRef.current = marker;
        circleRef.current = circle;
        setMapsLoadState("ready");
        setErrorMessage(null);
      } catch (error) {
        if (cancelled || generation !== initGenerationRef.current) {
          return;
        }
        const mapped = mapGoogleMapsError(error);
        setMapsLoadState("error");
        setErrorMessage(mapped.message);
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      runCleanup();
    };
  }, [hasApiKey]);

  useEffect(() => {
    if (mapsLoadState !== "ready") {
      return;
    }
    const center = { lat: latitude, lng: longitude };
    mapInstanceRef.current?.setCenter(center);
    if (markerRef.current) {
      markerRef.current.position = center;
    }
    circleRef.current?.setCenter(center);
    circleRef.current?.setRadius(allowedRadiusMeters);
  }, [allowedRadiusMeters, latitude, longitude, mapsLoadState]);

  return {
    mapContainerRef,
    mapsLoadState,
    errorMessage,
  };
}
