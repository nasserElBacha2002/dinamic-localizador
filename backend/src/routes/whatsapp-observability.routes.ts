import { Router } from "express";
import { whatsappObservabilityController } from "../controllers/whatsapp-observability.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePlatformAdmin } from "../middleware/require-platform-admin";
import { validate } from "../middleware/validate";
import {
  observabilityConversationIdParamSchema,
  observabilityErrorCodeParamSchema,
  observabilityFlowIdParamSchema,
  observabilityListConversationsQuerySchema,
  observabilityListErrorsQuerySchema,
  observabilityListMessagesQuerySchema,
  observabilityMessageIdParamSchema,
  observabilityNotificationIdParamSchema,
} from "../schemas/whatsapp-observability.schema";
import { employeeLookupQuerySchema } from "../schemas/lookup.schema";

export const whatsappObservabilityRouter = Router();

whatsappObservabilityRouter.use(asyncHandler(requirePlatformAdmin));

whatsappObservabilityRouter.get(
  "/employee-lookups",
  validate(employeeLookupQuerySchema, "query"),
  asyncHandler(whatsappObservabilityController.listEmployeeLookups),
);
whatsappObservabilityRouter.get(
  "/conversations",
  validate(observabilityListConversationsQuerySchema, "query"),
  asyncHandler(whatsappObservabilityController.listConversations),
);
whatsappObservabilityRouter.get(
  "/conversations/:conversationId",
  validate(observabilityConversationIdParamSchema, "params"),
  asyncHandler(whatsappObservabilityController.getConversation),
);
whatsappObservabilityRouter.post(
  "/conversations/:conversationId/reveal-phone",
  validate(observabilityConversationIdParamSchema, "params"),
  asyncHandler(whatsappObservabilityController.revealPhone),
);
whatsappObservabilityRouter.get(
  "/conversations/:conversationId/messages",
  validate(observabilityConversationIdParamSchema, "params"),
  validate(observabilityListMessagesQuerySchema, "query"),
  asyncHandler(whatsappObservabilityController.listMessages),
);
whatsappObservabilityRouter.get(
  "/conversations/:conversationId/provider-events",
  validate(observabilityConversationIdParamSchema, "params"),
  asyncHandler(whatsappObservabilityController.listProviderEvents),
);
whatsappObservabilityRouter.get(
  "/messages/:messageId",
  validate(observabilityMessageIdParamSchema, "params"),
  asyncHandler(whatsappObservabilityController.getMessage),
);
whatsappObservabilityRouter.get(
  "/flows/:flowExecutionId",
  validate(observabilityFlowIdParamSchema, "params"),
  asyncHandler(whatsappObservabilityController.getFlow),
);
whatsappObservabilityRouter.get(
  "/errors",
  validate(observabilityListErrorsQuerySchema, "query"),
  asyncHandler(whatsappObservabilityController.listErrors),
);
whatsappObservabilityRouter.get(
  "/errors/:errorCode",
  validate(observabilityErrorCodeParamSchema, "params"),
  asyncHandler(whatsappObservabilityController.getError),
);
whatsappObservabilityRouter.get(
  "/notifications/:notificationId",
  validate(observabilityNotificationIdParamSchema, "params"),
  asyncHandler(whatsappObservabilityController.getNotification),
);
