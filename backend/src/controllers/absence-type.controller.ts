import type { Request, Response } from "express";
import { absenceTypeService } from "../services/absence-type.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const absenceTypeController = {
  async update(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await absenceTypeService.update(
      companyId,
      String(req.params.id),
      req.body,
      req.auth?.userId ?? null,
    );
    res.status(200).json({ data });
  },
};
