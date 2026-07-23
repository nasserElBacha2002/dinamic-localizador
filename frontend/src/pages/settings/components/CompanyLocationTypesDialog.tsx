import { Button, Group } from "@mantine/core";
import { ResponsiveModal } from "../../../design-system";
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
    <ResponsiveModal
      opened={opened}
      onClose={onClose}
      title="Formato"
      size="lg"
      bodyMode="scroll"
      footer={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cerrar
          </Button>
        </Group>
      }
    >
      <CompanyLocationTypesDialogContent locationTypes={locationTypes} canUpdate={canUpdate} />
    </ResponsiveModal>
  );
}
