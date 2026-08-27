import { Button, Group } from "@mantine/core";
import type { CompanySettings } from "../../../types/company-settings";
import { ResponsiveModal } from "../../../design-system";
import { CompanyWhatsAppAlertsDialogContent } from "./CompanyWhatsAppAlertsDialogContent";

interface CompanyWhatsAppAlertsDialogProps {
  opened: boolean;
  onClose: () => void;
  settings: CompanySettings;
  canUpdate: boolean;
  onSaved: (message: string) => void;
}

export function CompanyWhatsAppAlertsDialog({
  opened,
  onClose,
  settings,
  canUpdate,
  onSaved,
}: CompanyWhatsAppAlertsDialogProps) {
  return (
    <ResponsiveModal
      opened={opened}
      onClose={onClose}
      title="Alertas WhatsApp"
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
      <CompanyWhatsAppAlertsDialogContent
        settings={settings}
        canUpdate={canUpdate}
        onSaved={onSaved}
      />
    </ResponsiveModal>
  );
}
