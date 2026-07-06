import { Alert, Button, Stack, Text, TextInput } from "@mantine/core";
import type { BotSimulationMode } from "../../../api/bot-simulator.api";
import { EmployeeSearchAutocomplete } from "../../../components/employees/EmployeeSearchAutocomplete";
import { OperationSearchAutocomplete } from "../../../components/operations/OperationSearchAutocomplete";
import { ServiceSearchAutocomplete } from "../../../components/services/ServiceSearchAutocomplete";
import { FilterSelect, SectionCard } from "../../../design-system";
import type { BotSimulatorSessionState } from "../hooks/useBotSimulatorSession";

type BotSessionPanelProps = Pick<
  BotSimulatorSessionState,
  | "employeeId"
  | "setEmployeeId"
  | "operationId"
  | "setOperationId"
  | "resolvedServiceId"
  | "setManualServiceId"
  | "setServiceManuallySet"
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
  operationId,
  setOperationId,
  resolvedServiceId,
  setManualServiceId,
  setServiceManuallySet,
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
    <SectionCard
      title="Contexto de prueba"
      description="Configurá empleado, operación, tienda y escenario antes de iniciar."
    >
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

        <OperationSearchAutocomplete
          value={operationId}
          onChange={(id) => {
            setOperationId(id);
            setServiceManuallySet(false);
            setManualServiceId(null);
          }}
          allowCreate={false}
        />

        <ServiceSearchAutocomplete
          value={resolvedServiceId}
          onChange={(id) => {
            setServiceManuallySet(true);
            setManualServiceId(id);
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
          description="Formato local del navegador (DD/MM/AAAA en visualización regional)."
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
          <Button onClick={() => void handleStartSession()} disabled={!canStart || isBusy} loading={isBusy}>
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
    </SectionCard>
  );
}
