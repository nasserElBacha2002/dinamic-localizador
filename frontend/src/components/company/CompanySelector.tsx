import { Button, Group, Stack, Text, Title } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { FilterSelect } from "../../design-system";
import { useCompany } from "../../hooks/useCompany";

export function CompanySelector({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const { companies, activeCompany, selectCompany } = useCompany();

  if (companies.length <= 1) {
    if (!activeCompany) {
      return null;
    }

    return (
      <Text size={compact ? "sm" : "md"} c="inherit">
        {activeCompany.companyName}
      </Text>
    );
  }

  const companyOptions = companies.map((company) => ({
    value: company.companyId,
    label: company.companyName,
  }));

  return (
    <Group gap="xs" align="flex-end" wrap="nowrap">
      {!compact ? (
        <Text size="sm" c="inherit">
          Empresa
        </Text>
      ) : null}
      <FilterSelect
        label="Empresa activa"
        value={activeCompany?.companyId ?? ""}
        onChange={(companyId) => {
          selectCompany(companyId);
          navigate("/");
        }}
        data={companyOptions}
      />
    </Group>
  );
}

export function CompanySelectionPage() {
  const { companies, selectCompany } = useCompany();
  const navigate = useNavigate();

  return (
    <Stack maw={480} mx="auto" mt="xl" px="md" gap="md">
      <div>
        <Title order={3}>Seleccioná una empresa</Title>
        <Text c="dimmed" size="sm">
          Tu usuario pertenece a más de una empresa. Elegí con cuál querés operar.
        </Text>
      </div>
      <Stack gap="sm">
        {companies.map((company) => (
          <Button
            key={company.companyId}
            variant="default"
            onClick={() => {
              selectCompany(company.companyId);
              navigate("/");
            }}
            styles={{
              root: {
                height: "auto",
                padding: "var(--mantine-spacing-md)",
              },
              inner: {
                justifyContent: "flex-start",
              },
              label: {
                width: "100%",
              },
            }}
          >
            <Stack gap={2} align="flex-start">
              <Text fw={600}>{company.companyName}</Text>
              <Text size="sm" c="dimmed">
                Rol: {company.role}
              </Text>
            </Stack>
          </Button>
        ))}
      </Stack>
    </Stack>
  );
}
