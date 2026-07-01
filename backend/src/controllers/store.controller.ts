import type { Request, Response } from "express";
import { storeService } from "../services/store.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const storeController = {
  async create(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const store = await storeService.create(companyId, req.body);
    res.status(201).json({ data: store });
  },

  async list(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await storeService.list(companyId, req.validatedQuery as never);
    res.status(200).json(result);
  },

  async getById(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const store = await storeService.getById(companyId, String(req.params.id));
    res.status(200).json({ data: store });
  },

  async update(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const store = await storeService.update(companyId, String(req.params.id), req.body);
    res.status(200).json({ data: store });
  },

  async deactivate(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const store = await storeService.deactivate(companyId, String(req.params.id));
    res.status(200).json({ data: store });
  },
};
