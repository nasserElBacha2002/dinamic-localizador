import {
  Alert,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { BotSimulationMode } from "../../../api/bot-simulator.api";
import { EmployeeSearchAutocomplete } from "../../../components/employees/EmployeeSearchAutocomplete";
import { InventorySearchAutocomplete } from "../../../components/inventories/InventorySearchAutocomplete";
import { StoreSearchAutocomplete } from "../../../components/stores/StoreSearchAutocomplete";
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
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Contexto de prueba
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Configurá el escenario antes de iniciar la simulación.
      </Typography>

      <Stack spacing={2}>
        <TextField
          label="Empresa"
          value=""
          disabled
          helperText="Preparado para multi-empresa (próximamente)"
          fullWidth
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

        <TextField
          label="Teléfono WhatsApp simulado"
          value={resolvedPhoneNumber}
          onChange={(event) => {
            setPhoneManuallySet(true);
            setManualPhoneNumber(event.target.value);
          }}
          placeholder="+5491111111111"
          fullWidth
          required
        />

        <TextField
          label="Fecha y hora simulada"
          type="datetime-local"
          value={simulatedNowInput}
          onChange={(event) => setSimulatedNowInput(event.target.value)}
          fullWidth
          InputLabelProps={{ shrink: true }}
        />

        <FormControl fullWidth>
          <InputLabel id="simulation-mode-label">Modo de simulación</InputLabel>
          <Select
            labelId="simulation-mode-label"
            label="Modo de simulación"
            value={mode}
            onChange={(event) => setMode(event.target.value as BotSimulationMode)}
          >
            <MenuItem value="dry-run">Simulación (dry-run)</MenuItem>
            <MenuItem value="persistent">Persistente (marca registros como simulación)</MenuItem>
          </Select>
        </FormControl>

        {!sessionId ? (
          <Button variant="contained" onClick={() => void handleStartSession()} disabled={!canStart || isBusy}>
            Iniciar simulación
          </Button>
        ) : (
          <Alert severity="info">
            Sesión activa: <strong>{sessionId}</strong>. Reiniciá para limpiar mensajes y estado.
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
