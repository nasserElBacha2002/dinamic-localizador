import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createBotSimulationSession,
  getBotSimulationLocationPresets,
  getBotSimulationSession,
  restartBotSimulationSession,
  sendBotSimulationLocation,
  sendBotSimulationMessage,
  type CreateBotSimulationSessionInput,
} from "../api/bot-simulator.api";

export function useBotSimulationSession(sessionId?: string) {
  return useQuery({
    queryKey: ["bot-simulator-session", sessionId],
    queryFn: () => getBotSimulationSession(sessionId!),
    enabled: Boolean(sessionId),
  });
}

export function useBotSimulationLocationPresets(sessionId?: string) {
  return useQuery({
    queryKey: ["bot-simulator-location-presets", sessionId],
    queryFn: () => getBotSimulationLocationPresets(sessionId!),
    enabled: Boolean(sessionId),
  });
}

export function useCreateBotSimulationSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBotSimulationSessionInput) => createBotSimulationSession(input),
    onSuccess: (data) => {
      queryClient.setQueryData(["bot-simulator-session", data.sessionId], data);
    },
  });
}

export function useRestartBotSimulationSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: restartBotSimulationSession,
    onSuccess: (data) => {
      queryClient.setQueryData(["bot-simulator-session", data.sessionId], data);
    },
  });
}

export function useSendBotSimulationMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, text }: { sessionId: string; text: string }) =>
      sendBotSimulationMessage(sessionId, text),
    onSuccess: (data) => {
      queryClient.setQueryData(["bot-simulator-session", data.sessionId], data);
    },
  });
}

export function useSendBotSimulationLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      latitude,
      longitude,
    }: {
      sessionId: string;
      latitude: number;
      longitude: number;
    }) => sendBotSimulationLocation(sessionId, latitude, longitude),
    onSuccess: (data) => {
      queryClient.setQueryData(["bot-simulator-session", data.sessionId], data);
    },
  });
}
