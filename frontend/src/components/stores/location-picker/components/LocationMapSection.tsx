import { Alert, Box, Stack, Typography } from "@mui/material";
import type { ReactNode, RefObject } from "react";
import type { MapsLoadState } from "../types";
import type { LocationPickerState } from "../../../../utils/store-location";

type LocationMapSectionProps = {
  mapContainerRef: RefObject<HTMLDivElement | null>;
  autocompleteContainerRef: RefObject<HTMLDivElement | null>;
  mapsLoadState: MapsLoadState;
  locationState: LocationPickerState;
};

export function LocationMapSection({
  mapContainerRef,
  autocompleteContainerRef,
  mapsLoadState,
  locationState,
}: LocationMapSectionProps) {
  const showGoogleMapsUi = mapsLoadState === "loading" || mapsLoadState === "ready";

  if (!showGoogleMapsUi) {
    return null;
  }

  return (
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
          flex: 1,
          minHeight: { xs: 260, lg: 380 },
          borderRadius: 1,
          border: "1px solid",
          borderColor: "divider",
          visibility: mapsLoadState === "ready" ? "visible" : "hidden",
        }}
      />
      {locationState === "SEARCHING" ? (
        <Alert severity="info">
          Seleccioná una sugerencia de la lista para confirmar la ubicación. Escribir texto no alcanza.
        </Alert>
      ) : null}
    </>
  );
}

export function LocationPickerLayout({ children }: { children: ReactNode }) {
  return (
    <Stack spacing={2} sx={{ width: "100%" }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1.15fr 1fr" },
          gap: 2,
          alignItems: "stretch",
        }}
      >
        {children}
      </Box>
    </Stack>
  );
}
