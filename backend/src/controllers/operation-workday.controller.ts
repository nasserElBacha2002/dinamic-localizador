import type { Request, Response } from "express";
import { operationWorkdayService } from "../services/operation-workday.service";
import { recurringWorkdayMaterializationService } from "../services/recurring-workday-materialization.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const operationWorkdayController = {
  async list(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await operationWorkdayService.list(
      companyId,
      String(req.params.id),
      req.validatedQuery as never,
    );
    res.status(200).json(result);
  },

  async getDetail(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const detail = await operationWorkdayService.getDetail(
      companyId,
      String(req.params.id),
      String(req.params.workdayId),
    );
    res.status(200).json({ data: detail });
  },

  async materialize(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await recurringWorkdayMaterializationService.materializeOperationHorizon(
      companyId,
      String(req.params.id),
    );
    res.status(200).json({ data: result });
  },
};
