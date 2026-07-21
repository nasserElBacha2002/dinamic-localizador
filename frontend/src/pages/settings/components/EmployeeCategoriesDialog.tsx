import { Button, Group, Modal, Stack } from "@mantine/core";
import type { EmployeeCategory } from "../../../types/employee-category";
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
    <Modal opened={opened} onClose={onClose} title="Categorías de colaboradores" size="lg" centered>
      <Stack gap="md">
        <EmployeeCategoriesDialogContent categories={categories} canUpdate={canUpdate} />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cerrar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
