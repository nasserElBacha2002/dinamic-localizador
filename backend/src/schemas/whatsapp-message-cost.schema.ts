import { z } from "zod";
import { MESSAGE_COST_KINDS, MESSAGE_COST_QUALITIES } from "../constants/whatsapp-message-cost";

const optionalUuid = z.string().uuid().optional();

export const messageCostMonthQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  companyId: optionalUuid,
  messageKind: z.enum(MESSAGE_COST_KINDS).optional(),
  templateSid: z.string().max(100).optional(),
  providerStatus: z.string().max(40).optional(),
  costQuality: z.enum(MESSAGE_COST_QUALITIES).optional(),
});

export type MessageCostMonthQuery = z.infer<typeof messageCostMonthQuerySchema>;

export const messageCostDetailQuerySchema = messageCostMonthQuerySchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type MessageCostDetailQuery = z.infer<typeof messageCostDetailQuerySchema>;

export const messageCostResyncBodySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  companyId: optionalUuid,
  ledgerIds: z.array(z.string().uuid()).max(200).optional(),
  maxRows: z.coerce.number().int().min(1).max(5_000).default(500),
});

export type MessageCostResyncBody = z.infer<typeof messageCostResyncBodySchema>;
