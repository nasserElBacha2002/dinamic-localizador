import type { Request, Response } from "express";
import { workTeamAssignmentService } from "../services/work-team-assignment.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const workTeamAssignmentController = {
  async preview(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await workTeamAssignmentService.preview(
      companyId,
      String(req.params.operationId),
      req.auth?.userId ?? null,
      req.body,
    );
    res.status(200).json({ data: result });
  },

  async confirm(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await workTeamAssignmentService.confirm(
      companyId,
      String(req.params.operationId),
      req.auth?.userId ?? null,
      req.body,
    );
    res.status(200).json({ data: result });
  },

  async getBatchDetail(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await workTeamAssignmentService.getBatchDetail(
      companyId,
      String(req.params.batchId),
    );
    res.status(200).json({ data: result });
  },
};
