import { Button, Group } from "@mantine/core";
import type { LocationZone } from "../../../types/location-zone";
import { ResponsiveModal } from "../../../design-system";
import { LocationZonesDialogContent } from "./LocationZonesDialogContent";

interface LocationZonesDialogProps {
  opened: boolean;
  onClose: () => void;
  zones: LocationZone[];
  canUpdate: boolean;
}

export function LocationZonesDialog({
  opened,
  onClose,
  zones,
  canUpdate,
}: LocationZonesDialogProps) {
  return (
    <ResponsiveModal
      opened={opened}
      onClose={onClose}
      title="Barrios y localidades"
      size="xl"
      bodyMode="scroll"
      footer={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cerrar
          </Button>
        </Group>
      }
    >
      <LocationZonesDialogContent zones={zones} canUpdate={canUpdate} />
    </ResponsiveModal>
  );
}
