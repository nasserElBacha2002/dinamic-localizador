import { z } from "zod";
import { SYSTEM_LOG_LEVELS } from "../constants/system-logs";

const uuid = z.string().uuid();

export const systemLogsListQuerySchema = z
  .object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    level: z.enum(SYSTEM_LOG_LEVELS).optional(),
    module: z.string().trim().min(1).max(80).optional(),
    event: z.string().trim().min(1).max(120).optional(),
    companyId: uuid.optional(),
    requestId: z.string().trim().min(8).max(64).optional(),
    correlationId: z.string().trim().min(8).max(64).optional(),
    operationId: uuid.optional(),
    employeeId: uuid.optional(),
    conversationId: uuid.optional(),
    jobExecutionId: z.string().trim().min(1).max(64).optional(),
    q: z.string().trim().min(1).max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .superRefine((data, ctx) => {
    if (data.from && data.to && new Date(data.from) > new Date(data.to)) {
      ctx.addIssue({
        code: "custom",
        message: "from must be <= to",
        path: ["from"],
      });
    }
  });

export type SystemLogsListQuery = z.infer<typeof systemLogsListQuerySchema>;

export const systemLogIdParamSchema = z.object({
  id: uuid,
});
