import { Code, ScrollArea, Stack, Tabs, Text } from "@mantine/core";
import { EmptyState, SectionCard } from "../../../design-system";

type BotTechnicalDetailsProps = {
  entries: Array<{ label: string; value: string }>;
};

function isJsonValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

export function BotTechnicalDetails({ entries }: BotTechnicalDetailsProps) {
  if (entries.length === 0) {
    return (
      <SectionCard title="Detalles técnicos" description="Estado de sesión, payloads y validaciones.">
        <EmptyState
          title="Sin sesión activa"
          description="Iniciá una simulación para ver payloads, estado y resultados de validación."
        />
      </SectionCard>
    );
  }

  const summaryEntries = entries.filter((entry) => !isJsonValue(entry.value));
  const jsonEntries = entries.filter((entry) => isJsonValue(entry.value));

  return (
    <SectionCard
      title="Detalles técnicos"
      description="Payloads simulados, estado de sesión y resultados de validación."
    >
      <Tabs defaultValue="summary" variant="outline">
        <Tabs.List mb="sm">
          <Tabs.Tab value="summary">Resumen</Tabs.Tab>
          <Tabs.Tab value="json">JSON / payloads</Tabs.Tab>
          <Tabs.Tab value="all">Todo</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="summary">
          <ScrollArea.Autosize mah={520} type="auto">
            <Stack gap="sm">
              {summaryEntries.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No hay campos de resumen disponibles.
                </Text>
              ) : (
                summaryEntries.map((entry) => (
                  <Stack key={entry.label} gap={2}>
                    <Text size="xs" c="dimmed" fw={600}>
                      {entry.label}
                    </Text>
                    <Text size="sm">{entry.value}</Text>
                  </Stack>
                ))
              )}
            </Stack>
          </ScrollArea.Autosize>
        </Tabs.Panel>

        <Tabs.Panel value="json">
          <ScrollArea.Autosize mah={520} type="auto">
            <Stack gap="md">
              {jsonEntries.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No hay payloads JSON en esta sesión.
                </Text>
              ) : (
                jsonEntries.map((entry) => (
                  <Stack key={entry.label} gap={4}>
                    <Text size="xs" c="dimmed" fw={600}>
                      {entry.label}
                    </Text>
                    <Code block style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {entry.value}
                    </Code>
                  </Stack>
                ))
              )}
            </Stack>
          </ScrollArea.Autosize>
        </Tabs.Panel>

        <Tabs.Panel value="all">
          <ScrollArea.Autosize mah={520} type="auto">
            <Stack gap="md">
              {entries.map((entry) => (
                <Stack key={entry.label} gap={4}>
                  <Text size="xs" c="dimmed" fw={600}>
                    {entry.label}
                  </Text>
                  {isJsonValue(entry.value) ? (
                    <Code block style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {entry.value}
                    </Code>
                  ) : (
                    <Text size="sm">{entry.value}</Text>
                  )}
                </Stack>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        </Tabs.Panel>
      </Tabs>
    </SectionCard>
  );
}
