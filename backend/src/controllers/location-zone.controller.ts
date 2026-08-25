import type { Request, Response } from "express";
import type { ListLocationZonesQuery } from "../schemas/location-zone.schema";
import { locationZoneService } from "../services/location-zone.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const locationZoneController = {
  async list(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const zones = await locationZoneService.list(
      companyId,
      (req.validatedQuery ?? { includeInactive: false }) as ListLocationZonesQuery,
    );
    res.status(200).json({ data: zones });
  },

  async geocodingSummary(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const summary = await locationZoneService.geocodingSummary(companyId);
    res.status(200).json({ data: summary });
  },

  async create(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const zone = await locationZoneService.create(companyId, req.companyRole!, req.body);
    res.status(201).json({ data: zone });
  },

  async update(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const zone = await locationZoneService.update(
      companyId,
      req.companyRole!,
      String(req.params.zoneId),
      req.body,
    );
    res.status(200).json({ data: zone });
  },

  async geocode(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const force = Boolean(req.body?.force);
    const zone = await locationZoneService.geocode(
      companyId,
      req.companyRole!,
      String(req.params.zoneId),
      { force },
    );
    res.status(200).json({ data: zone });
  },
};
