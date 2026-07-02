import type { Request, Response } from "express";
import { inventoryService } from "../services/inventory.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const inventoryController = {
  async create(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const inventory = await inventoryService.create(companyId, req.body);
    res.status(201).json({ data: inventory });
  },

  async list(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await inventoryService.list(companyId, req.validatedQuery as never);
    res.status(200).json(result);
  },

  async getById(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const inventory = await inventoryService.getDetailById(companyId, String(req.params.id));
    res.status(200).json({ data: inventory });
  },

  async update(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const inventory = await inventoryService.update(companyId, String(req.params.id), req.body);
    res.status(200).json({ data: inventory });
  },

  async cancel(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const inventory = await inventoryService.cancel(companyId, String(req.params.id));
    res.status(200).json({ data: inventory });
  },

  async getAttendanceSummary(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const query = req.validatedQuery as { page: number; limit: number };
    const summary = await inventoryService.getAttendanceSummary(
      companyId,
      String(req.params.id),
      query.page,
      query.limit,
    );
    res.status(200).json({ data: summary });
  },
};
