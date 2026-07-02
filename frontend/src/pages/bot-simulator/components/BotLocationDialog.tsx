import { Alert, Button, Group, Modal, NumberInput, Stack } from "@mantine/core";
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
    <Modal
      opened={locationDialogOpen}
      onClose={() => setLocationDialogOpen(false)}
      title="Enviar ubicación simulada"
      centered
    >
      <Stack gap="md">
        {locationPresets ? (
          <Alert color="blue">
            Radio permitido: {locationPresets.allowedRadiusMeters ?? "—"} m · Margen de revisión:{" "}
            {locationPresets.reviewMarginMeters} m
          </Alert>
        ) : null}

        <NumberInput
          label="Latitud"
          value={customLatitude === "" ? "" : Number(customLatitude)}
          onChange={(value) => {
            setCustomLatitude(value === "" || value === undefined ? "" : String(value));
            setCustomLatitudeError(null);
          }}
          error={customLatitudeError ?? undefined}
          allowDecimal
          decimalScale={8}
        />
        <NumberInput
          label="Longitud"
          value={customLongitude === "" ? "" : Number(customLongitude)}
          onChange={(value) => {
            setCustomLongitude(value === "" || value === undefined ? "" : String(value));
            setCustomLongitudeError(null);
          }}
          error={customLongitudeError ?? undefined}
          allowDecimal
          decimalScale={8}
        />

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={() => setLocationDialogOpen(false)}>
            Cancelar
          </Button>
          <Button
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
        </Group>
      </Stack>
    </Modal>
  );
}
