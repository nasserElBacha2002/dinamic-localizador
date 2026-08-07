import { Button, Group, Stack } from "@mantine/core";
import { useState, type ReactNode } from "react";
import type { CompanyRole } from "../../types/company-user";
import { RolePermissionsDialog } from "./RolePermissionsDialog";

export interface RolePermissionsActionProps {
  role: CompanyRole | null | undefined;
  /** Optional label override. */
  label?: string;
}

/**
 * Trigger + dialog for inspecting the selected company role.
 * Keeps dialog state local so invite/edit forms stay unchanged.
 */
export function RolePermissionsAction({
  role,
  label = "Ver permisos del rol",
}: RolePermissionsActionProps) {
  const [opened, setOpened] = useState(false);
  const disabled = !role;

  return (
    <>
      <Group justify="flex-start">
        <Button
          variant="subtle"
          size="compact-sm"
          disabled={disabled}
          onClick={() => setOpened(true)}
          aria-label={label}
        >
          {label}
        </Button>
      </Group>
      <RolePermissionsDialog
        opened={opened}
        onClose={() => setOpened(false)}
        role={role}
      />
    </>
  );
}

/** Layout helper: role select + permissions action in a vertical stack. */
export function RoleSelectWithPermissions({
  children,
  role,
}: {
  children: ReactNode;
  role: CompanyRole | null | undefined;
}) {
  return (
    <Stack gap={6}>
      {children}
      <RolePermissionsAction role={role} />
    </Stack>
  );
}
