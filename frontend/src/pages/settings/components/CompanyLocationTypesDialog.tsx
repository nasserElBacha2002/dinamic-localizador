import { Button, Group, Modal, Stack } from "@mantine/core";
import { CompanyLocationTypesDialogContent } from "./CompanyLocationTypesDialogContent";
import type { CompanyLocationType } from "../../../types/company-location-type";

interface CompanyLocationTypesDialogProps {
  opened: boolean;
  onClose: () => void;
  locationTypes: CompanyLocationType[];
  canUpdate: boolean;
}

export function CompanyLocationTypesDialog({
  opened,
  onClose,
  locationTypes,
  canUpdate,
}: CompanyLocationTypesDialogProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Tipos de ubicación / servicio"
      size="lg"
      centered
    >
      <Stack gap="md">
        <CompanyLocationTypesDialogContent
          locationTypes={locationTypes}
          canUpdate={canUpdate}
        />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cerrar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
