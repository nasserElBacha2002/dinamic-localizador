import { z } from "zod";

export const botSimulationModeSchema = z.enum(["dry-run", "persistent"]);

export const createBotSimulationSessionSchema = z.object({
  companyId: z.string().uuid().optional().nullable(),
  employeeId: z.string().uuid(),
  operationId: z.string().uuid().optional().nullable(),
  serviceId: z.string().uuid().optional().nullable(),
  phoneNumber: z.string().trim().min(8),
  simulatedNow: z.string().datetime(),
  mode: botSimulationModeSchema.default("dry-run"),
});

export const sendBotSimulationMessageSchema = z.object({
  sessionId: z.string().uuid(),
  text: z.string().trim().min(1),
});

export const sendBotSimulationLocationSchema = z.object({
  sessionId: z.string().uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export type CreateBotSimulationSessionInput = z.infer<typeof createBotSimulationSessionSchema>;
export type SendBotSimulationMessageInput = z.infer<typeof sendBotSimulationMessageSchema>;
export type SendBotSimulationLocationInput = z.infer<typeof sendBotSimulationLocationSchema>;
