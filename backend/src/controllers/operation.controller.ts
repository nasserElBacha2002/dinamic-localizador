import type { Request, Response } from "express";
import { operationService } from "../services/operation.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const operationController = {
  async create(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const inventory = await operationService.create(companyId, req.body);
    res.status(201).json({ data: inventory });
  },

  async list(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await operationService.list(companyId, req.validatedQuery as never);
    res.status(200).json(result);
  },

  async getById(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const inventory = await operationService.getDetailById(companyId, String(req.params.id));
    res.status(200).json({ data: inventory });
  },

  async update(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const inventory = await operationService.update(companyId, String(req.params.id), req.body);
    res.status(200).json({ data: inventory });
  },

  async cancel(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const inventory = await operationService.cancel(companyId, String(req.params.id));
    res.status(200).json({ data: inventory });
  },

  async getAttendanceSummary(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const query = req.validatedQuery as { page: number; limit: number };
    const summary = await operationService.getAttendanceSummary(
      companyId,
      String(req.params.id),
      query.page,
      query.limit,
    );
    res.status(200).json({ data: summary });
  },
};
