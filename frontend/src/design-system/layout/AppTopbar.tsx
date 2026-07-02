import { ActionIcon, Badge, Box, Burger, Group, Menu, Text, Title } from "@mantine/core";
import { useAuth } from "../../hooks/useAuth";
import { useCompany } from "../../hooks/useCompany";
import { companyRoleLabels } from "../../utils/labels";
import type { CompanyRole } from "../../types/company-user";
import { CompanySwitcher } from "./CompanySwitcher";

const NAVBAR_BREAKPOINT = "md";

interface AppTopbarProps {
  mobileOpened: boolean;
  onToggleMobile: () => void;
}

function getRoleLabel(role: string | undefined): string | null {
  if (!role) {
    return null;
  }

  return companyRoleLabels[role as CompanyRole] ?? role;
}

function UserMenu({
  userName,
  roleLabel,
  onLogout,
  mobile = false,
}: {
  userName: string;
  roleLabel: string | null;
  onLogout: () => void;
  mobile?: boolean;
}) {
  const trigger = mobile ? (
    <ActionIcon variant="light" color="brand" size="lg" aria-label="Menú de usuario">
      <Text size="sm" fw={700}>
        {userName.charAt(0).toUpperCase()}
      </Text>
    </ActionIcon>
  ) : (
    <Group gap="xs" wrap="nowrap" style={{ cursor: "pointer" }}>
      <div style={{ textAlign: "right", minWidth: 0 }}>
        <Text
          size="sm"
          fw={600}
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}
        >
          {userName}
        </Text>
        {roleLabel ? (
          <Text size="xs" c="dimmed" style={{ lineHeight: 1.2 }}>
            {roleLabel}
          </Text>
        ) : null}
      </div>
      <Badge variant="light" color="secondary" size="sm">
        ▾
      </Badge>
    </Group>
  );

  return (
    <Menu withinPortal position="bottom-end" shadow="md" width={220}>
      <Menu.Target>{trigger}</Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{userName}</Menu.Label>
        {roleLabel ? <Menu.Label>{roleLabel}</Menu.Label> : null}
        <Menu.Divider />
        <Menu.Item color="red" onClick={onLogout}>
          Cerrar sesión
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

export function AppTopbar({ mobileOpened, onToggleMobile }: AppTopbarProps) {
  const { user, logout } = useAuth();
  const { activeCompany } = useCompany();
  const roleLabel = getRoleLabel(activeCompany?.role);

  return (
    <Group h="100%" px="md" justify="space-between" wrap="nowrap" gap="sm">
      <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
        <Burger
          opened={mobileOpened}
          onClick={onToggleMobile}
          hiddenFrom={NAVBAR_BREAKPOINT}
          size="sm"
          aria-label="Abrir menú"
        />
        <Title
          order={4}
          c="brand.7"
          visibleFrom="xs"
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          Dinamic Attendance
        </Title>
        <Title
          order={5}
          c="brand.7"
          hiddenFrom="xs"
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          Dinamic
        </Title>
      </Group>

      {user ? (
        <Group gap="sm" wrap="nowrap" style={{ flexShrink: 1, minWidth: 0, justifyContent: "flex-end" }}>
          <Group gap="xs" wrap="nowrap" visibleFrom="sm">
            <CompanySwitcher />
          </Group>
          <Group gap="xs" wrap="nowrap" hiddenFrom="sm">
            <CompanySwitcher compact />
          </Group>
          <Group gap="xs" wrap="nowrap" visibleFrom="sm">
            <UserMenu userName={user.name} roleLabel={roleLabel} onLogout={logout} />
          </Group>
          <Box hiddenFrom="sm">
            <UserMenu userName={user.name} roleLabel={roleLabel} onLogout={logout} mobile />
          </Box>
        </Group>
      ) : null}
    </Group>
  );
}
