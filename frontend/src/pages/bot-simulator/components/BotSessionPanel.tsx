import { Alert, Button, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import type { BotSimulationMode } from "../../../api/bot-simulator.api";
import { EmployeeSearchAutocomplete } from "../../../components/employees/EmployeeSearchAutocomplete";
import { InventorySearchAutocomplete } from "../../../components/inventories/InventorySearchAutocomplete";
import { StoreSearchAutocomplete } from "../../../components/stores/StoreSearchAutocomplete";
import { FilterSelect } from "../../../design-system";
import type { BotSimulatorSessionState } from "../hooks/useBotSimulatorSession";

type BotSessionPanelProps = Pick<
  BotSimulatorSessionState,
  | "employeeId"
  | "setEmployeeId"
  | "inventoryId"
  | "setInventoryId"
  | "resolvedStoreId"
  | "setManualStoreId"
  | "setStoreManuallySet"
  | "resolvedPhoneNumber"
  | "setManualPhoneNumber"
  | "setPhoneManuallySet"
  | "simulatedNowInput"
  | "setSimulatedNowInput"
  | "mode"
  | "setMode"
  | "sessionId"
  | "canStart"
  | "isBusy"
  | "handleStartSession"
>;

export function BotSessionPanel({
  employeeId,
  setEmployeeId,
  inventoryId,
  setInventoryId,
  resolvedStoreId,
  setManualStoreId,
  setStoreManuallySet,
  resolvedPhoneNumber,
  setManualPhoneNumber,
  setPhoneManuallySet,
  simulatedNowInput,
  setSimulatedNowInput,
  mode,
  setMode,
  sessionId,
  canStart,
  isBusy,
  handleStartSession,
}: BotSessionPanelProps) {
  return (
    <Paper withBorder radius="md" p="md">
      <Title order={4} mb={4}>
        Contexto de prueba
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        Configurá el escenario antes de iniciar la simulación.
      </Text>

      <Stack gap="md">
        <TextInput
          label="Empresa"
          value=""
          disabled
          description="Preparado para multi-empresa (próximamente)"
        />

        <EmployeeSearchAutocomplete
          value={employeeId}
          onChange={(id) => {
            setEmployeeId(id);
            setPhoneManuallySet(false);
            setManualPhoneNumber("");
          }}
          activeOnly
          allowCreate={false}
          required
        />

        <InventorySearchAutocomplete
          value={inventoryId}
          onChange={(id) => {
            setInventoryId(id);
            setStoreManuallySet(false);
            setManualStoreId(null);
          }}
          allowCreate={false}
        />

        <StoreSearchAutocomplete
          value={resolvedStoreId}
          onChange={(id) => {
            setStoreManuallySet(true);
            setManualStoreId(id);
          }}
          activeOnly={false}
          allowCreate={false}
        />

        <TextInput
          label="Teléfono WhatsApp simulado"
          value={resolvedPhoneNumber}
          onChange={(event) => {
            setPhoneManuallySet(true);
            setManualPhoneNumber(event.currentTarget.value);
          }}
          placeholder="+5491111111111"
          required
        />

        <TextInput
          label="Fecha y hora simulada"
          type="datetime-local"
          value={simulatedNowInput}
          onChange={(event) => setSimulatedNowInput(event.currentTarget.value)}
        />

        <FilterSelect
          label="Modo de simulación"
          value={mode}
          onChange={(value) => setMode(value as BotSimulationMode)}
          data={[
            { value: "dry-run", label: "Simulación (dry-run)" },
            { value: "persistent", label: "Persistente (marca registros como simulación)" },
          ]}
        />

        {!sessionId ? (
          <Button onClick={() => void handleStartSession()} disabled={!canStart || isBusy}>
            Iniciar simulación
          </Button>
        ) : (
          <Alert color="blue" title="Sesión activa">
            <Text size="sm">
              ID: <strong>{sessionId}</strong>. Reiniciá para limpiar mensajes y estado.
            </Text>
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
