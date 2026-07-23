import { Button, Group } from "@mantine/core";
import type { EmployeeCategory } from "../../../types/employee-category";
import { ResponsiveModal } from "../../../design-system";
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
    <ResponsiveModal
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
    </ResponsiveModal>
  );
}
