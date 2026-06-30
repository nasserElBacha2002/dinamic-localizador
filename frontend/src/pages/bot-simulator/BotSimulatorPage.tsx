import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BotSimulationMode,
  BotSimulationSessionState,
  BotSimulatorMessage,
} from "../../api/bot-simulator.api";
import { EmployeeSearchAutocomplete } from "../../components/employees/EmployeeSearchAutocomplete";
import { InventorySearchAutocomplete } from "../../components/inventories/InventorySearchAutocomplete";
import { StoreSearchAutocomplete } from "../../components/stores/StoreSearchAutocomplete";
import { PageHeader } from "../../components/common/PageHeader";
import {
  useBotSimulationLocationPresets,
  useCreateBotSimulationSession,
  useRestartBotSimulationSession,
  useSendBotSimulationLocation,
  useSendBotSimulationMessage,
} from "../../hooks/useBotSimulator";
import { useEmployee } from "../../hooks/useEmployees";
import { useInventory } from "../../hooks/useInventories";
import { AdminLayout } from "../../layouts/AdminLayout";
import { formatDateTime } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";

const BADGE_LABELS: Record<string, string> = {
  "Dry-run": "Simulación",
  Persistent: "Persistente",
  "Waiting for location": "Esperando ubicación",
  "Active session": "Sesión activa",
  "Requires review": "Requiere revisión",
  "Arrival registered": "Llegada registrada",
  "Departure registered": "Salida registrada",
  Error: "Error",
};

function toLocalDateTimeInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localDateTimeInputToIso(value: string): string {
  return new Date(value).toISOString();
}

function ChatBubble({ message }: { message: BotSimulatorMessage }) {
  const isUser = message.direction === "INBOUND";
  const isLocation = message.messageType === "LOCATION";

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        mb: 1.5,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          maxWidth: "85%",
          px: 2,
          py: 1.25,
          borderRadius: 2,
          bgcolor: isUser ? "primary.main" : "grey.100",
          color: isUser ? "primary.contrastText" : "text.primary",
        }}
      >
        {isLocation ? (
          <Stack spacing={0.5}>
            <Typography variant="body2" fontWeight={600}>
              📍 Ubicación enviada
            </Typography>
            <Typography variant="caption" component="div">
              Lat: {message.latitude}
            </Typography>
            <Typography variant="caption" component="div">
              Lng: {message.longitude}
            </Typography>
          </Stack>
        ) : (
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
            {message.body}
          </Typography>
        )}
        <Typography
          variant="caption"
          sx={{ display: "block", mt: 0.5, opacity: 0.75, textAlign: isUser ? "right" : "left" }}
        >
          {formatDateTime(message.createdAt)}
        </Typography>
      </Paper>
    </Box>
  );
}

function validateCoordinate(
  value: string,
  kind: "latitude" | "longitude",
): string | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return kind === "latitude" ? "Ingresá una latitud válida." : "Ingresá una longitud válida.";
  }

  if (kind === "latitude" && (numeric < -90 || numeric > 90)) {
    return "La latitud debe estar entre -90 y 90.";
  }

  if (kind === "longitude" && (numeric < -180 || numeric > 180)) {
    return "La longitud debe estar entre -180 y 180.";
  }

  return null;
}

export function BotSimulatorPage() {
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [inventoryId, setInventoryId] = useState<string | null>(null);
  const [manualStoreId, setManualStoreId] = useState<string | null>(null);
  const [storeManuallySet, setStoreManuallySet] = useState(false);
  const [manualPhoneNumber, setManualPhoneNumber] = useState("");
  const [phoneManuallySet, setPhoneManuallySet] = useState(false);
  const [simulatedNowInput, setSimulatedNowInput] = useState(() => toLocalDateTimeInputValue(new Date()));
  const [mode, setMode] = useState<BotSimulationMode>("dry-run");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<BotSimulationSessionState | null>(null);
  const [draftText, setDraftText] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [customLatitude, setCustomLatitude] = useState("");
  const [customLongitude, setCustomLongitude] = useState("");
  const [customLatitudeError, setCustomLatitudeError] = useState<string | null>(null);
  const [customLongitudeError, setCustomLongitudeError] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: employee } = useEmployee(employeeId ?? undefined);
  const { data: inventory } = useInventory(inventoryId ?? undefined);

  const createSessionMutation = useCreateBotSimulationSession();
  const restartSessionMutation = useRestartBotSimulationSession();
  const sendMessageMutation = useSendBotSimulationMessage();
  const sendLocationMutation = useSendBotSimulationLocation();
  const { data: locationPresets } = useBotSimulationLocationPresets(sessionId ?? undefined);

  const resolvedPhoneNumber = phoneManuallySet
    ? manualPhoneNumber
    : (employee?.phoneNumber ?? manualPhoneNumber);
  const resolvedStoreId = storeManuallySet ? manualStoreId : (inventory?.storeId ?? manualStoreId);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessionState?.messages.length]);

  const isBusy =
    createSessionMutation.isPending ||
    restartSessionMutation.isPending ||
    sendMessageMutation.isPending ||
    sendLocationMutation.isPending;

  const canStart = Boolean(employeeId && resolvedPhoneNumber.trim());

  const handleStartSession = async () => {
    if (!employeeId || !resolvedPhoneNumber.trim()) {
      return;
    }

    setActionError(null);
    try {
      const result = await createSessionMutation.mutateAsync({
        employeeId,
        inventoryId,
        storeId: resolvedStoreId,
        phoneNumber: resolvedPhoneNumber.trim(),
        simulatedNow: localDateTimeInputToIso(simulatedNowInput),
        mode,
      });
      setSessionId(result.sessionId);
      setSessionState(result);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    }
  };

  const applySessionResult = (result: BotSimulationSessionState) => {
    setSessionState(result);
    setActionError(null);
  };

  const handleNewSimulation = () => {
    setSessionId(null);
    setSessionState(null);
    setDraftText("");
    setActionError(null);
    setCustomLatitude("");
    setCustomLongitude("");
    setCustomLatitudeError(null);
    setCustomLongitudeError(null);
    setLocationDialogOpen(false);
    setEmployeeId(null);
    setInventoryId(null);
    setManualStoreId(null);
    setStoreManuallySet(false);
    setManualPhoneNumber("");
    setPhoneManuallySet(false);
  };

  const handleRestart = async () => {
    if (!sessionId) {
      return;
    }

    setActionError(null);
    try {
      const result = await restartSessionMutation.mutateAsync(sessionId);
      applySessionResult(result);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    }
  };

  const handleSendText = async (text: string) => {
    if (!sessionId || !text.trim()) {
      return;
    }

    setActionError(null);
    try {
      const result = await sendMessageMutation.mutateAsync({ sessionId, text: text.trim() });
      applySessionResult(result);
      setDraftText("");
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    }
  };

  const handleSendLocation = async (latitude: number, longitude: number) => {
    if (!sessionId) {
      return;
    }

    setActionError(null);
    try {
      const result = await sendLocationMutation.mutateAsync({ sessionId, latitude, longitude });
      applySessionResult(result);
      setLocationDialogOpen(false);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    }
  };

  const handleExportJson = () => {
    if (!sessionState) {
      return;
    }

    const blob = new Blob([JSON.stringify(sessionState, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bot-simulator-${sessionState.sessionId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const technicalEntries = useMemo(() => {
    if (!sessionState) {
      return [];
    }

    const details = sessionState.technicalDetails;
    const entries: Array<{ label: string; value: string }> = [
      { label: "ID de sesión", value: sessionState.sessionId },
      { label: "Modo", value: sessionState.mode === "dry-run" ? "Simulación (dry-run)" : "Persistente" },
      { label: "Flujo actual", value: sessionState.currentFlow ?? "—" },
      { label: "Nodo actual", value: sessionState.currentNode ?? "—" },
    ];

    const optionalKeys: Array<[string, string]> = [
      ["companyId", "Empresa"],
      ["employeeName", "Empleado"],
      ["employeeId", "ID empleado"],
      ["inventoryId", "Inventario"],
      ["storeId", "Tienda"],
      ["phoneNumber", "Teléfono simulado"],
      ["lastDetectedIntent", "Última intención"],
      ["calculatedDistance", "Distancia calculada (m)"],
      ["allowedRadius", "Radio permitido (m)"],
      ["reviewMargin", "Margen de revisión (m)"],
      ["expectedResult", "Resultado esperado"],
      ["generatedBotResponse", "Respuesta del bot"],
      ["error", "Error"],
    ];

    for (const [key, label] of optionalKeys) {
      const value = details[key];
      if (value !== undefined && value !== null && value !== "") {
        entries.push({
          label,
          value: typeof value === "object" ? JSON.stringify(value, null, 2) : String(value),
        });
      }
    }

    if (sessionState.createdRecords.length > 0) {
      entries.push({
        label: "Artefactos de simulación",
        value: JSON.stringify(
          sessionState.technicalDetails.simulationArtifacts ?? sessionState.createdRecords,
          null,
          2,
        ),
      });
    }

    if (sessionState.technicalDetails.virtualAttendanceRecords) {
      entries.push({
        label: "Asistencias virtuales (dry-run)",
        value: JSON.stringify(sessionState.technicalDetails.virtualAttendanceRecords, null, 2),
      });
    }

    if (details.lastTwilioPayload) {
      entries.push({
        label: "Payload Twilio simulado",
        value: JSON.stringify(details.lastTwilioPayload, null, 2),
      });
    }

    return entries;
  }, [sessionState]);

  return (
    <AdminLayout>
      <PageHeader
        title="Simulador de Bot"
        description="Probá flujos conversacionales del bot de WhatsApp sin depender del webhook de Twilio."
        action={
          <Stack direction="row" spacing={1}>
            {sessionState ? (
              <>
                <Button variant="outlined" onClick={handleNewSimulation} disabled={isBusy}>
                  Nueva simulación
                </Button>
                <Button variant="outlined" onClick={handleExportJson}>
                  Exportar JSON
                </Button>
                <Button variant="outlined" onClick={handleRestart} disabled={isBusy}>
                  Reiniciar conversación
                </Button>
              </>
            ) : null}
          </Stack>
        }
      />

      {actionError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {actionError}
        </Alert>
      ) : null}

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 4 }}>
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
                <Button variant="contained" onClick={handleStartSession} disabled={!canStart || isBusy}>
                  Iniciar simulación
                </Button>
              ) : (
                <Alert severity="info">
                  Sesión activa: <strong>{sessionId}</strong>. Reiniciá para limpiar mensajes y estado.
                </Alert>
              )}
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper sx={{ p: 2, minHeight: 480, display: "flex", flexDirection: "column" }}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
              {sessionState?.statusBadges.map((badge) => (
                <Chip key={badge} label={BADGE_LABELS[badge] ?? badge} size="small" color="primary" variant="outlined" />
              ))}
            </Stack>

            {!sessionState ? (
              <Box sx={{ flex: 1, display: "grid", placeItems: "center" }}>
                <Typography color="text.secondary">
                  Configurá el contexto y presioná &quot;Iniciar simulación&quot; para comenzar.
                </Typography>
              </Box>
            ) : (
              <>
                <Box
                  sx={{
                    flex: 1,
                    overflowY: "auto",
                    maxHeight: 420,
                    mb: 2,
                    pr: 1,
                    bgcolor: "grey.50",
                    borderRadius: 1,
                    p: 2,
                  }}
                >
                  {sessionState.messages.map((message) => (
                    <ChatBubble key={message.id} message={message} />
                  ))}
                  <div ref={chatEndRef} />
                </Box>

                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                  <Button size="small" variant="outlined" disabled={isBusy} onClick={() => handleSendText("Llegué")}>
                    Enviar &quot;Llegué&quot;
                  </Button>
                  <Button size="small" variant="outlined" disabled={isBusy} onClick={() => handleSendText("Terminé")}>
                    Enviar &quot;Terminé&quot;
                  </Button>
                  <Button size="small" variant="outlined" disabled={isBusy} onClick={() => handleSendText("Hola")}>
                    Enviar &quot;Hola&quot;
                  </Button>
                  <Button size="small" variant="outlined" disabled={isBusy} onClick={() => handleSendText("Menú")}>
                    Enviar &quot;Menú&quot;
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={isBusy || !locationPresets?.storeLocation}
                    onClick={() => {
                      if (locationPresets?.storeLocation) {
                        void handleSendLocation(
                          locationPresets.storeLocation.latitude,
                          locationPresets.storeLocation.longitude,
                        );
                      }
                    }}
                  >
                    Ubicación de tienda
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={isBusy || !locationPresets?.outsideRadius}
                    onClick={() => {
                      if (locationPresets?.outsideRadius) {
                        void handleSendLocation(
                          locationPresets.outsideRadius.latitude,
                          locationPresets.outsideRadius.longitude,
                        );
                      }
                    }}
                  >
                    Fuera del radio
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={isBusy || !locationPresets?.nearRadiusLimit}
                    onClick={() => {
                      if (locationPresets?.nearRadiusLimit) {
                        void handleSendLocation(
                          locationPresets.nearRadiusLimit.latitude,
                          locationPresets.nearRadiusLimit.longitude,
                        );
                      }
                    }}
                  >
                    Cerca del límite
                  </Button>
                  <Button size="small" variant="outlined" disabled={isBusy} onClick={() => setLocationDialogOpen(true)}>
                    Enviar ubicación
                  </Button>
                </Stack>

                <Stack direction="row" spacing={1}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Escribí un mensaje..."
                    value={draftText}
                    onChange={(event) => setDraftText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleSendText(draftText);
                      }
                    }}
                    disabled={isBusy}
                  />
                  <Button variant="contained" onClick={() => handleSendText(draftText)} disabled={isBusy || !draftText.trim()}>
                    Enviar
                  </Button>
                </Stack>
              </>
            )}
          </Paper>
        </Grid>
      </Grid>

      {sessionState ? (
        <Accordion sx={{ mt: 3 }}>
          <AccordionSummary>
            <Typography fontWeight={600}>Detalles técnicos</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2} divider={<Divider flexItem />}>
              {technicalEntries.map((entry) => (
                <Box key={entry.label}>
                  <Typography variant="subtitle2" gutterBottom>
                    {entry.label}
                  </Typography>
                  <Typography
                    component="pre"
                    variant="body2"
                    sx={{
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontFamily: "monospace",
                      m: 0,
                    }}
                  >
                    {entry.value}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      ) : null}

      <Dialog open={locationDialogOpen} onClose={() => setLocationDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Enviar ubicación simulada</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {locationPresets ? (
              <Alert severity="info">
                Radio permitido: {locationPresets.allowedRadiusMeters ?? "—"} m · Margen de revisión:{" "}
                {locationPresets.reviewMarginMeters} m
              </Alert>
            ) : null}

            <TextField
              label="Latitud"
              value={customLatitude}
              onChange={(event) => {
                setCustomLatitude(event.target.value);
                setCustomLatitudeError(null);
              }}
              error={Boolean(customLatitudeError)}
              helperText={customLatitudeError ?? undefined}
              fullWidth
            />
            <TextField
              label="Longitud"
              value={customLongitude}
              onChange={(event) => {
                setCustomLongitude(event.target.value);
                setCustomLongitudeError(null);
              }}
              error={Boolean(customLongitudeError)}
              helperText={customLongitudeError ?? undefined}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLocationDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!customLatitude || !customLongitude || isBusy}
            onClick={() => {
              const latitudeError = validateCoordinate(customLatitude, "latitude");
              const longitudeError = validateCoordinate(customLongitude, "longitude");
              setCustomLatitudeError(latitudeError);
              setCustomLongitudeError(longitudeError);
              if (latitudeError || longitudeError) {
                return;
              }

              void handleSendLocation(Number(customLatitude), Number(customLongitude));
            }}
          >
            Enviar ubicación
          </Button>
        </DialogActions>
      </Dialog>
    </AdminLayout>
  );
}
