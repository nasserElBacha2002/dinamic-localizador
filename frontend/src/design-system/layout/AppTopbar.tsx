import {
  ActionIcon,
  Burger,
  Button,
  Group,
  Menu,
  Select,
  Text,
  Title,
} from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useCompany } from "../../hooks/useCompany";

const NAVBAR_BREAKPOINT = "md";

interface AppTopbarProps {
  mobileOpened: boolean;
  onToggleMobile: () => void;
}

function CompanyTopbarSelector({ mobile = false }: { mobile?: boolean }) {
  const navigate = useNavigate();
  const { companies, activeCompany, selectCompany } = useCompany();

  const handleCompanyChange = (value: string | null) => {
    if (!value) {
      return;
    }

    // selectCompany is synchronous; clears query cache via CompanyContext.
    selectCompany(value);
    navigate("/");
  };

  if (companies.length <= 1) {
    if (!activeCompany) {
      return null;
    }

    return (
      <Text
        size={mobile ? "xs" : "sm"}
        fw={500}
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: mobile ? 112 : 240,
        }}
      >
        {activeCompany.companyName}
      </Text>
    );
  }

  return (
    <Select
      size="xs"
      w={mobile ? 112 : 220}
      maw="100%"
      label={mobile ? undefined : "Empresa activa"}
      aria-label="Empresa activa"
      comboboxProps={{ withinPortal: true }}
      value={activeCompany?.companyId ?? ""}
      onChange={handleCompanyChange}
      data={companies.map((company) => ({
        value: company.companyId,
        label: company.companyName,
      }))}
    />
  );
}

function DesktopUserActions({ userName, onLogout }: { userName: string; onLogout: () => void }) {
  return (
    <Group gap="sm" wrap="nowrap" visibleFrom="sm">
      <Text
        size="sm"
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: 180,
        }}
      >
        {userName}
      </Text>
      <Button variant="subtle" size="compact-sm" onClick={onLogout}>
        Cerrar sesión
      </Button>
    </Group>
  );
}

function MobileUserMenu({ userName, onLogout }: { userName: string; onLogout: () => void }) {
  return (
    <Menu withinPortal position="bottom-end" shadow="md">
      <Menu.Target>
        <ActionIcon variant="subtle" size="lg" aria-label="Menú de usuario" hiddenFrom="sm">
          <Text size="sm" fw={600}>
            {userName.charAt(0).toUpperCase()}
          </Text>
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{userName}</Menu.Label>
        <Menu.Item onClick={onLogout}>Cerrar sesión</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

export function AppTopbar({ mobileOpened, onToggleMobile }: AppTopbarProps) {
  const { user, logout } = useAuth();

  return (
    <Group h="100%" px="md" justify="space-between" wrap="nowrap" gap="xs">
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
          visibleFrom="xs"
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          Dinamic Attendance
        </Title>
        <Title
          order={5}
          hiddenFrom="xs"
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          Dinamic
        </Title>
      </Group>

      {user ? (
        <Group gap="xs" wrap="nowrap" style={{ flexShrink: 1, minWidth: 0, justifyContent: "flex-end" }}>
          <Group gap="xs" wrap="nowrap" visibleFrom="sm">
            <CompanyTopbarSelector />
          </Group>
          <Group gap="xs" wrap="nowrap" hiddenFrom="sm">
            <CompanyTopbarSelector mobile />
          </Group>
          <DesktopUserActions userName={user.name} onLogout={logout} />
          <MobileUserMenu userName={user.name} onLogout={logout} />
        </Group>
      ) : null}
    </Group>
  );
}
