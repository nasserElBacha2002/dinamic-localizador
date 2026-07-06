import { Button, Group } from "@mantine/core";
import type { LocationPresets } from "../../../api/bot-simulator.api";

interface BotQuickActionsProps {
  isBusy: boolean;
  locationPresets?: LocationPresets | null;
  onSendText: (text: string) => void;
  onSendLocation: (latitude: number, longitude: number) => void;
  onOpenLocationDialog: () => void;
}

export function BotQuickActions({
  isBusy,
  locationPresets,
  onSendText,
  onSendLocation,
  onOpenLocationDialog,
}: BotQuickActionsProps) {
  return (
    <Group gap="xs" wrap="wrap">
      <Button size="compact-xs" variant="default" disabled={isBusy} onClick={() => void onSendText("Llegué")}>
        Enviar &quot;Llegué&quot;
      </Button>
      <Button size="compact-xs" variant="default" disabled={isBusy} onClick={() => void onSendText("Terminé")}>
        Enviar &quot;Terminé&quot;
      </Button>
      <Button size="compact-xs" variant="default" disabled={isBusy} onClick={() => void onSendText("Hola")}>
        Enviar &quot;Hola&quot;
      </Button>
      <Button size="compact-xs" variant="default" disabled={isBusy} onClick={() => void onSendText("Menú")}>
        Enviar &quot;Menú&quot;
      </Button>
      <Button
        size="compact-xs"
        variant="default"
        disabled={isBusy || !locationPresets?.serviceLocation}
        onClick={() => {
          if (locationPresets?.serviceLocation) {
            void onSendLocation(
              locationPresets.serviceLocation.latitude,
              locationPresets.serviceLocation.longitude,
            );
          }
        }}
      >
        Ubicación del servicio
      </Button>
      <Button
        size="compact-xs"
        variant="default"
        disabled={isBusy || !locationPresets?.outsideRadius}
        onClick={() => {
          if (locationPresets?.outsideRadius) {
            void onSendLocation(
              locationPresets.outsideRadius.latitude,
              locationPresets.outsideRadius.longitude,
            );
          }
        }}
      >
        Fuera del radio
      </Button>
      <Button
        size="compact-xs"
        variant="default"
        disabled={isBusy || !locationPresets?.nearRadiusLimit}
        onClick={() => {
          if (locationPresets?.nearRadiusLimit) {
            void onSendLocation(
              locationPresets.nearRadiusLimit.latitude,
              locationPresets.nearRadiusLimit.longitude,
            );
          }
        }}
      >
        Cerca del límite
      </Button>
      <Button size="compact-xs" variant="default" disabled={isBusy} onClick={onOpenLocationDialog}>
        Enviar ubicación
      </Button>
    </Group>
  );
}
