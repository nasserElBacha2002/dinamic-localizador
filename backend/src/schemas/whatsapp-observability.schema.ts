import { z } from "zod";
import { WHATSAPP_CONVERSATION_STATUSES } from "../constants/whatsapp-observability";

const uuid = z.string().uuid();
const optionalUuid = z.string().uuid().optional();
const isoDate = z.string().datetime({ offset: true });

export const observabilityConversationIdParamSchema = z.object({
  conversationId: uuid,
});

export const observabilityMessageIdParamSchema = z.object({
  messageId: uuid,
});

export const observabilityFlowIdParamSchema = z.object({
  flowExecutionId: uuid,
});

export const observabilityNotificationIdParamSchema = z.object({
  notificationId: uuid,
});

export const observabilityErrorCodeParamSchema = z.object({
  errorCode: z.string().min(1).max(80),
});

export const observabilityListConversationsQuerySchema = z
  .object({
    companyId: optionalUuid,
    employeeId: optionalUuid,
    phone: z.string().max(40).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    flowType: z.string().max(60).optional(),
    resultCode: z.string().max(80).optional(),
    status: z.enum(WHATSAPP_CONVERSATION_STATUSES).optional(),
    hasError: z
      .enum(["true", "false", "1", "0"])
      .optional()
      .transform((value) => {
        if (value === undefined) {
          return undefined;
        }
        return value === "true" || value === "1";
      }),
    search: z.string().max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .superRefine((data, ctx) => {
    if (data.from && data.to && new Date(data.from) > new Date(data.to)) {
      ctx.addIssue({
        code: "custom",
        message: "El rango de fechas es inválido (from > to).",
        path: ["from"],
      });
    }
  });

export const observabilityListMessagesQuerySchema = z
  .object({
    limit: z.coerce
      .number()
      .int("El límite debe ser un entero")
      .min(1, "El límite debe ser al menos 1")
      .max(100, "El límite máximo por solicitud es 100")
      .default(50),
    beforeCreatedAt: z.string().datetime({ offset: true }).optional(),
    beforeId: uuid.optional(),
    direction: z.enum(["INBOUND", "OUTBOUND"]).optional(),
  })
  .superRefine((data, ctx) => {
    const hasCreatedAt = data.beforeCreatedAt !== undefined;
    const hasId = data.beforeId !== undefined;
    if (hasCreatedAt !== hasId) {
      ctx.addIssue({
        code: "custom",
        message: "beforeCreatedAt y beforeId deben enviarse juntos.",
        path: hasCreatedAt ? ["beforeId"] : ["beforeCreatedAt"],
      });
    }
  });

export type ObservabilityListMessagesQuery = z.infer<typeof observabilityListMessagesQuerySchema>;

export const observabilityListErrorsQuerySchema = z
  .object({
    companyId: optionalUuid,
    from: isoDate.optional(),
    to: isoDate.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .superRefine((data, ctx) => {
    if (data.from && data.to && new Date(data.from) > new Date(data.to)) {
      ctx.addIssue({
        code: "custom",
        message: "El rango de fechas es inválido (from > to).",
        path: ["from"],
      });
    }
  });
