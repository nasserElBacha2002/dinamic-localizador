import type { Request, Response } from "express";
import type {
  MessageCostDetailQuery,
  MessageCostMonthQuery,
  MessageCostResyncBody,
} from "../schemas/whatsapp-message-cost.schema";
import { whatsappMessageCostQueryService } from "../services/whatsapp-message-cost-query.service";

export const whatsappMessageCostController = {
  async getMonthlySummary(req: Request, res: Response): Promise<void> {
    const data = await whatsappMessageCostQueryService.getMonthlySummary(
      req.validatedQuery as MessageCostMonthQuery,
    );
    res.json(data);
  },

  async getCompanyBreakdown(req: Request, res: Response): Promise<void> {
    const data = await whatsappMessageCostQueryService.getCompanyBreakdown(
      req.validatedQuery as MessageCostMonthQuery,
    );
    res.json(data);
  },

  async getTemplateBreakdown(req: Request, res: Response): Promise<void> {
    const data = await whatsappMessageCostQueryService.getTemplateBreakdown(
      req.validatedQuery as MessageCostMonthQuery,
    );
    res.json(data);
  },

  async listDetail(req: Request, res: Response): Promise<void> {
    const data = await whatsappMessageCostQueryService.listDetail(
      req.validatedQuery as MessageCostDetailQuery,
    );
    res.json(data);
  },

  async exportCsv(req: Request, res: Response): Promise<void> {
    const query = req.validatedQuery as MessageCostMonthQuery;
    const csv = await whatsappMessageCostQueryService.exportCsv(query);
    const filename = `whatsapp-message-costs-${query.year}-${String(query.month).padStart(2, "0")}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  },

  async requestResync(req: Request, res: Response): Promise<void> {
    const body = req.body as MessageCostResyncBody;
    const data = await whatsappMessageCostQueryService.requestResync(body, {
      userId: req.auth?.userId ?? null,
      companyIdForAudit: body.companyId ?? null,
    });
    res.status(202).json(data);
  },
};
