import { Burger, Button, Group, Select, Text, Title } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useCompany } from "../../hooks/useCompany";

const NAVBAR_BREAKPOINT = "md";

interface AppTopbarProps {
  mobileOpened: boolean;
  onToggleMobile: () => void;
}

function CompanyTopbarSelector({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const { companies, activeCompany, selectCompany } = useCompany();

  if (companies.length <= 1) {
    if (!activeCompany) {
      return null;
    }

    return (
      <Text size={compact ? "sm" : "md"} fw={500} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: compact ? 160 : 240 }}>
        {activeCompany.companyName}
      </Text>
    );
  }

  return (
    <Select
      size="xs"
      w={compact ? 160 : 220}
      label={compact ? undefined : "Empresa activa"}
      aria-label="Empresa activa"
      comboboxProps={{ withinPortal: true }}
      value={activeCompany?.companyId ?? ""}
      onChange={(value) => {
        if (!value) {
          return;
        }

        selectCompany(value);
        navigate("/");
      }}
      data={companies.map((company) => ({
        value: company.companyId,
        label: company.companyName,
      }))}
    />
  );
}

export function AppTopbar({ mobileOpened, onToggleMobile }: AppTopbarProps) {
  const { user, logout } = useAuth();

  return (
    <Group h="100%" px="md" justify="space-between" wrap="nowrap">
      <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
        <Burger
          opened={mobileOpened}
          onClick={onToggleMobile}
          hiddenFrom={NAVBAR_BREAKPOINT}
          size="sm"
          aria-label="Abrir menú"
        />
        <Title order={4} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Dinamic Attendance
        </Title>
      </Group>

      {user ? (
        <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
          <CompanyTopbarSelector compact />
          <Text size="sm" visibleFrom="sm" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
            {user.name}
          </Text>
          <Button variant="subtle" size="compact-sm" onClick={logout}>
            Cerrar sesión
          </Button>
        </Group>
      ) : null}
    </Group>
  );
}
