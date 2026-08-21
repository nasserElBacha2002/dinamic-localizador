import type { Request, Response } from "express";
import type { ObservabilityListMessagesQuery } from "../schemas/whatsapp-observability.schema";
import { whatsappObservabilityService } from "../services/whatsapp-observability.service";

export const whatsappObservabilityController = {
  async listConversations(req: Request, res: Response) {
    const query = req.validatedQuery as {
      companyId?: string;
      employeeId?: string;
      from?: string;
      to?: string;
      flowType?: string;
      resultCode?: string;
      status?: string;
      hasError?: boolean;
      page: number;
      limit: number;
    };
    const result = await whatsappObservabilityService.listConversations(query);
    res.status(200).json(result);
  },

  async listEmployeeLookups(req: Request, res: Response) {
    const data = await whatsappObservabilityService.listEmployeeLookups(
      req.validatedQuery as never,
    );
    res.status(200).json({ data });
  },

  async getConversation(req: Request, res: Response) {
    const detail = await whatsappObservabilityService.getConversation(
      String(req.params.conversationId),
      req.auth!.userId,
    );
    res.status(200).json({ data: detail });
  },

  async revealPhone(req: Request, res: Response) {
    const result = await whatsappObservabilityService.revealPhone(
      String(req.params.conversationId),
      req.auth!.userId,
      {
        ip: req.ip,
        userAgent: req.get("user-agent"),
      },
    );
    res.status(200).json({ data: result });
  },

  async listMessages(req: Request, res: Response) {
    const query = req.validatedQuery as ObservabilityListMessagesQuery;
    const result = await whatsappObservabilityService.listMessages(
      String(req.params.conversationId),
      query,
    );
    res.status(200).json(result);
  },

  async listProviderEvents(req: Request, res: Response) {
    const events = await whatsappObservabilityService.listProviderEvents(
      String(req.params.conversationId),
      req.auth!.userId,
    );
    res.status(200).json({ data: events });
  },

  async getMessage(req: Request, res: Response) {
    const message = await whatsappObservabilityService.getMessage(
      String(req.params.messageId),
      req.auth!.userId,
    );
    res.status(200).json({ data: message });
  },

  async getFlow(req: Request, res: Response) {
    const detail = await whatsappObservabilityService.getFlow(
      String(req.params.flowExecutionId),
      req.auth!.userId,
    );
    res.status(200).json({ data: detail });
  },

  async listErrors(req: Request, res: Response) {
    const query = req.validatedQuery as {
      companyId?: string;
      from?: string;
      to?: string;
      page: number;
      limit: number;
    };
    const result = await whatsappObservabilityService.listErrors(query);
    res.status(200).json(result);
  },

  async getError(req: Request, res: Response) {
    const detail = await whatsappObservabilityService.getError(String(req.params.errorCode));
    res.status(200).json({ data: detail });
  },

  async getNotification(req: Request, res: Response) {
    const detail = await whatsappObservabilityService.getNotification(
      String(req.params.notificationId),
      req.auth!.userId,
    );
    res.status(200).json({ data: detail });
  },
};
