import { Group, Menu, Text, UnstyledButton } from "@mantine/core";
import { useNavigate } from "react-router";
import { useCompany } from "../../hooks/useCompany";
import { companyRoleLabels } from "../../utils/labels";
import type { CompanyRole } from "../../types/company-user";
import { EntityAvatar } from "../components/EntityAvatar";
import classes from "./company-switcher.module.css";

interface CompanySwitcherProps {
  compact?: boolean;
}

function getRoleLabel(role: string): string {
  return companyRoleLabels[role as CompanyRole] ?? role;
}

function CompanySwitcherDisplay({
  companyName,
  compact = false,
  interactive = false,
}: {
  companyName: string;
  compact?: boolean;
  interactive?: boolean;
}) {
  return (
    <div
      className={[
        classes.switcher,
        compact ? classes.switcherCompact : "",
        interactive ? classes.switcherInteractive : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/*
        Visual decision: brand tone (not deterministic palette) to preserve the
        previous active-company look. Size stays `sm` (32px) in compact and default
        to match the pre-avatar switcher icon.
      */}
      <EntityAvatar name={companyName} entityType="company" size="sm" tone="brand" />
      <div className={classes.content}>
        {!compact ? <div className={classes.label}>Empresa activa</div> : null}
        <div className={[classes.name, compact ? classes.nameCompact : ""].filter(Boolean).join(" ")}>
          {companyName}
        </div>
      </div>
      {interactive ? <span className={classes.chevron} aria-hidden>▾</span> : null}
    </div>
  );
}

export function CompanySwitcher({ compact = false }: CompanySwitcherProps) {
  const navigate = useNavigate();
  const { companies, activeCompany, selectCompany } = useCompany();

  if (!activeCompany) {
    return null;
  }

  const handleSelect = (companyId: string) => {
    if (companyId === activeCompany.companyId) {
      return;
    }

    selectCompany(companyId);
    navigate("/");
  };

  if (companies.length <= 1) {
    return <CompanySwitcherDisplay companyName={activeCompany.companyName} compact={compact} />;
  }

  return (
    <Menu withinPortal position="bottom-end" shadow="md" width={280}>
      <Menu.Target>
        <UnstyledButton aria-label="Cambiar empresa activa">
          <CompanySwitcherDisplay
            companyName={activeCompany.companyName}
            compact={compact}
            interactive
          />
        </UnstyledButton>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>Cambiar empresa</Menu.Label>
        {companies.map((company) => {
          const isActive = company.companyId === activeCompany.companyId;
          return (
            <Menu.Item
              key={company.companyId}
              className={isActive ? classes.menuItemActive : undefined}
              onClick={() => handleSelect(company.companyId)}
              rightSection={isActive ? "✓" : undefined}
            >
              <Group gap="sm" wrap="nowrap" align="flex-start">
                <EntityAvatar name={company.companyName} entityType="company" size="sm" tone="brand" />
                <div className={classes.menuItemText}>
                  <Text size="sm" fw={isActive ? 600 : 500} lineClamp={1}>
                    {company.companyName}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {getRoleLabel(company.role)}
                  </Text>
                </div>
              </Group>
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}
