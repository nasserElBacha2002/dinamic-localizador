import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BotSimulationMode,
  BotSimulationSessionState,
} from "../../../api/bot-simulator.api";
import {
  useBotSimulationLocationPresets,
  useCreateBotSimulationSession,
  useRestartBotSimulationSession,
  useSendBotSimulationLocation,
  useSendBotSimulationMessage,
} from "../../../hooks/useBotSimulator";
import { useEmployee } from "../../../hooks/useEmployees";
import { useOperation } from "../../../hooks/useOperations";
import { getApiErrorMessage } from "../../../utils/errors";
import { localDateTimeInputToIso, toLocalDateTimeInputValue } from "../utils";

export function useBotSimulatorSession() {
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [manualServiceId, setManualServiceId] = useState<string | null>(null);
  const [serviceManuallySet, setServiceManuallySet] = useState(false);
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
  const { data: operation } = useOperation(operationId ?? undefined);

  const createSessionMutation = useCreateBotSimulationSession();
  const restartSessionMutation = useRestartBotSimulationSession();
  const sendMessageMutation = useSendBotSimulationMessage();
  const sendLocationMutation = useSendBotSimulationLocation();
  const { data: locationPresets } = useBotSimulationLocationPresets(sessionId ?? undefined);

  const resolvedPhoneNumber = phoneManuallySet
    ? manualPhoneNumber
    : (employee?.phoneNumber ?? manualPhoneNumber);
  const resolvedServiceId = serviceManuallySet ? manualServiceId : (operation?.serviceId ?? manualServiceId);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessionState?.messages.length]);

  const isBusy =
    createSessionMutation.isPending ||
    restartSessionMutation.isPending ||
    sendMessageMutation.isPending ||
    sendLocationMutation.isPending;

  const canStart = Boolean(employeeId && resolvedPhoneNumber.trim());

  const applySessionResult = (result: BotSimulationSessionState) => {
    setSessionState(result);
    setActionError(null);
  };

  const handleStartSession = async () => {
    if (!employeeId || !resolvedPhoneNumber.trim()) {
      return;
    }

    setActionError(null);
    try {
      const result = await createSessionMutation.mutateAsync({
        employeeId,
        operationId,
        serviceId: resolvedServiceId,
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
    setOperationId(null);
    setManualServiceId(null);
    setServiceManuallySet(false);
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
      ["operationId", "Operación"],
      ["serviceId", "Servicio"],
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

  return {
    employeeId,
    setEmployeeId,
    operationId,
    setOperationId,
    manualServiceId,
    setManualServiceId,
    setServiceManuallySet,
    manualPhoneNumber,
    setManualPhoneNumber,
    setPhoneManuallySet,
    simulatedNowInput,
    setSimulatedNowInput,
    mode,
    setMode,
    sessionId,
    sessionState,
    draftText,
    setDraftText,
    actionError,
    locationDialogOpen,
    setLocationDialogOpen,
    customLatitude,
    setCustomLatitude,
    customLongitude,
    setCustomLongitude,
    customLatitudeError,
    setCustomLatitudeError,
    customLongitudeError,
    setCustomLongitudeError,
    chatEndRef,
    resolvedPhoneNumber,
    resolvedServiceId,
    locationPresets,
    isBusy,
    canStart,
    handleStartSession,
    handleNewSimulation,
    handleRestart,
    handleSendText,
    handleSendLocation,
    handleExportJson,
    technicalEntries,
  };
}

export type BotSimulatorSessionState = ReturnType<typeof useBotSimulatorSession>;
