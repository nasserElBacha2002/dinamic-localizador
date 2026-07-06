import { Paper, SimpleGrid, Stack, Text } from "@mantine/core";

interface MetricItem {
  label: string;
  value: number;
}

interface MetricGroupProps {
  title: string;
  items: MetricItem[];
}

function MetricGroup({ title, items }: MetricGroupProps) {
  return (
    <Stack gap="xs">
      <Text size="xs" tt="uppercase" c="dimmed" fw={600} lts={0.4}>
        {title}
      </Text>
      <SimpleGrid cols={{ base: 2, sm: 2, md: items.length >= 5 ? 5 : 4 }} spacing="sm">
        {items.map((item) => (
          <Paper key={item.label} withBorder p="sm" radius="md">
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                {item.label}
              </Text>
              <Text size="lg" fw={700} lh={1.2}>
                {item.value}
              </Text>
            </Stack>
          </Paper>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

interface OperationalSummaryMetricsProps {
  summary: {
    assigned: number;
    confirmedEmployees: number;
    pendingConfirmationEmployees: number;
    unavailableEmployees: number;
    checkedIn: number;
    valid: number;
    pendingReview: number;
    rejected: number;
    withoutCheckIn: number;
  };
}

export function OperationalSummaryMetrics({ summary }: OperationalSummaryMetricsProps) {
  return (
    <Stack gap="md" mb="md">
      <MetricGroup
        title="Confirmación"
        items={[
          { label: "Asignados", value: summary.assigned },
          { label: "Confirmados", value: summary.confirmedEmployees },
          { label: "Pendientes", value: summary.pendingConfirmationEmployees },
          { label: "No disponibles", value: summary.unavailableEmployees },
        ]}
      />
      <MetricGroup
        title="Asistencia"
        items={[
          { label: "Con check-in", value: summary.checkedIn },
          { label: "Validados", value: summary.valid },
          { label: "A revisar", value: summary.pendingReview },
          { label: "Rechazados", value: summary.rejected },
          { label: "Sin registro", value: summary.withoutCheckIn },
        ]}
      />
    </Stack>
  );
}
