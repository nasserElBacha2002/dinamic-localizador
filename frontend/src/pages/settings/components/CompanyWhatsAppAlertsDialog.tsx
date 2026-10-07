import { Button, Group } from "@mantine/core";
import type { CompanySettings } from "../../../types/company-settings";
import { SettingsResponsiveModal } from "./SettingsResponsiveModal";
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
    <SettingsResponsiveModal
      opened={opened}
      onClose={onClose}
      title="Alertas y reporte diario"
      size="xl"
      bodyMode="scroll"
      footer={
        <Group justify="flex-end">
          <Button variant="default" size="md" onClick={onClose}>
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
    </SettingsResponsiveModal>
  );
}
