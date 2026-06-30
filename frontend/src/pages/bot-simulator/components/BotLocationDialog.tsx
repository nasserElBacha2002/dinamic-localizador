import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import type { BotSimulatorSessionState } from "../hooks/useBotSimulatorSession";
import { validateCoordinate } from "../utils";

type BotLocationDialogProps = Pick<
  BotSimulatorSessionState,
  | "locationDialogOpen"
  | "setLocationDialogOpen"
  | "locationPresets"
  | "customLatitude"
  | "setCustomLatitude"
  | "customLongitude"
  | "setCustomLongitude"
  | "customLatitudeError"
  | "setCustomLatitudeError"
  | "customLongitudeError"
  | "setCustomLongitudeError"
  | "isBusy"
  | "handleSendLocation"
>;

export function BotLocationDialog({
  locationDialogOpen,
  setLocationDialogOpen,
  locationPresets,
  customLatitude,
  setCustomLatitude,
  customLongitude,
  setCustomLongitude,
  customLatitudeError,
  setCustomLatitudeError,
  customLongitudeError,
  setCustomLongitudeError,
  isBusy,
  handleSendLocation,
}: BotLocationDialogProps) {
  return (
    <Dialog open={locationDialogOpen} onClose={() => setLocationDialogOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle>Enviar ubicación simulada</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {locationPresets ? (
            <Alert severity="info">
              Radio permitido: {locationPresets.allowedRadiusMeters ?? "—"} m · Margen de revisión:{" "}
              {locationPresets.reviewMarginMeters} m
            </Alert>
          ) : null}

          <TextField
            label="Latitud"
            value={customLatitude}
            onChange={(event) => {
              setCustomLatitude(event.target.value);
              setCustomLatitudeError(null);
            }}
            error={Boolean(customLatitudeError)}
            helperText={customLatitudeError ?? undefined}
            fullWidth
          />
          <TextField
            label="Longitud"
            value={customLongitude}
            onChange={(event) => {
              setCustomLongitude(event.target.value);
              setCustomLongitudeError(null);
            }}
            error={Boolean(customLongitudeError)}
            helperText={customLongitudeError ?? undefined}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setLocationDialogOpen(false)}>Cancelar</Button>
        <Button
          variant="contained"
          disabled={!customLatitude || !customLongitude || isBusy}
          onClick={() => {
            const latitudeError = validateCoordinate(customLatitude, "latitude");
            const longitudeError = validateCoordinate(customLongitude, "longitude");
            setCustomLatitudeError(latitudeError);
            setCustomLongitudeError(longitudeError);
            if (latitudeError || longitudeError) {
              return;
            }

            void handleSendLocation(Number(customLatitude), Number(customLongitude));
          }}
        >
          Enviar ubicación
        </Button>
      </DialogActions>
    </Dialog>
  );
}
