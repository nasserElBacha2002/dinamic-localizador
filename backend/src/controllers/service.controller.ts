import type { Request, Response } from "express";
import { serviceService } from "../services/service.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const serviceController = {
  async create(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const service = await serviceService.create(companyId, req.body);
    res.status(201).json({ data: service });
  },

  async list(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await serviceService.list(companyId, req.validatedQuery as never);
    res.status(200).json(result);
  },

  async listFacets(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const facets = await serviceService.listFacets(companyId);
    res.status(200).json({ data: facets });
  },

  async getById(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const service = await serviceService.getById(companyId, String(req.params.id));
    res.status(200).json({ data: service });
  },

  async update(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const service = await serviceService.update(companyId, String(req.params.id), req.body);
    res.status(200).json({ data: service });
  },

  async deactivate(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const service = await serviceService.deactivate(companyId, String(req.params.id));
    res.status(200).json({ data: service });
  },
};
