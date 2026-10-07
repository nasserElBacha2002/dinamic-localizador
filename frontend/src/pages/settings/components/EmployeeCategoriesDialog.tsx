import { Button, Group } from "@mantine/core";
import type { EmployeeCategory } from "../../../types/employee-category";
import { SettingsResponsiveModal } from "./SettingsResponsiveModal";
import { EmployeeCategoriesDialogContent } from "./EmployeeCategoriesDialogContent";

interface EmployeeCategoriesDialogProps {
  opened: boolean;
  onClose: () => void;
  categories: EmployeeCategory[];
  canUpdate: boolean;
}

export function EmployeeCategoriesDialog({
  opened,
  onClose,
  categories,
  canUpdate,
}: EmployeeCategoriesDialogProps) {
  return (
    <SettingsResponsiveModal
      opened={opened}
      onClose={onClose}
      title="Categorías de colaboradores"
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
      <EmployeeCategoriesDialogContent categories={categories} canUpdate={canUpdate} />
    </SettingsResponsiveModal>
  );
}
