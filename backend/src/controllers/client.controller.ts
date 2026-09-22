import type { Request, Response } from "express";

import { clientService } from "../services/client.service";
import { companyLocationTypesService } from "../services/company-location-types.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const clientController = {
  async create(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);

    const client = await clientService.create(
      companyId,
      req.auth?.userId ?? null,
      req.body,
    );

    res.status(201).json({ data: client });
  },

  async list(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);

    const result = await clientService.list(
      companyId,
      req.validatedQuery as never,
    );

    res.status(200).json(result);
  },

  async getById(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);

    const client = await clientService.getById(
      companyId,
      String(req.params.clientId),
    );

    res.status(200).json({ data: client });
  },

  async update(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);

    const client = await clientService.update(
      companyId,
      String(req.params.clientId),
      req.auth?.userId ?? null,
      req.body,
    );

    res.status(200).json({ data: client });
  },

  async activate(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);

    const client = await clientService.activate(
      companyId,
      String(req.params.clientId),
      req.auth?.userId ?? null,
    );

    res.status(200).json({ data: client });
  },

  async deactivate(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);

    const client = await clientService.deactivate(
      companyId,
      String(req.params.clientId),
      req.auth?.userId ?? null,
    );

    res.status(200).json({ data: client });
  },

  async listLocationTypes(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await companyLocationTypesService.listLocationTypesForClient(companyId, String(req.params.clientId));
    res.status(200).json({ data });
  },
  async createLocationType(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await companyLocationTypesService.createLocationTypeForClient(companyId, String(req.params.clientId), req.body);
    res.status(201).json({ data });
  },
  async updateLocationType(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await companyLocationTypesService.updateLocationTypeForClient(companyId, String(req.params.clientId), String(req.params.locationTypeId), req.body);
    res.status(200).json({ data });
  },
  async disableLocationType(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await companyLocationTypesService.disableLocationTypeForClient(companyId, String(req.params.clientId), String(req.params.locationTypeId));
    res.status(200).json({ data });
  },
};
