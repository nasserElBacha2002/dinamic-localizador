import type { Request, Response } from "express";
import { operationAssignmentService } from "../services/operation-assignment.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const operationAssignmentController = {
  async assignEmployee(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const assignment = await operationAssignmentService.assignEmployee(
      companyId,
      String(req.params.operationId),
      req.body.employeeId,
      {
        validFrom: req.body.validFrom,
        validUntil: req.body.validUntil,
      },
      req.auth?.userId ?? null,
    );
    res.status(201).json({ data: assignment });
  },

  async listAssignmentPeriods(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const items = await operationAssignmentService.listAssignmentPeriods(
      companyId,
      String(req.params.operationId),
    );
    res.status(200).json({ data: items });
  },

  async cancelAssignment(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const assignment = await operationAssignmentService.cancelAssignment(
      companyId,
      String(req.params.operationId),
      String(req.params.assignmentId),
      req.auth?.userId ?? null,
    );
    res.status(200).json({ data: assignment });
  },

  async endAssignment(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const assignment = await operationAssignmentService.endAssignment(
      companyId,
      String(req.params.operationId),
      String(req.params.assignmentId),
      req.body.effectiveDate,
      req.auth?.userId ?? null,
    );
    res.status(200).json({ data: assignment });
  },
};
