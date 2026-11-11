import type { Request, Response } from "express";
import { operationChargeAssignmentService } from "../services/operations/operation-charge-assignment.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const operationChargeAssignmentController = {
  async listByOperation(req: Request, res: Response): Promise<void> {
    const companyId = requireRequestCompanyId(req);
    const operationId = String(req.params.operationId);
    const items = await operationChargeAssignmentService.listByOperation(companyId, operationId);
    res.status(200).json({ data: items });
  },

  async listByUser(req: Request, res: Response): Promise<void> {
    const companyId = requireRequestCompanyId(req);
    const userId = String(req.query.userId);
    const items = await operationChargeAssignmentService.listByUser(companyId, userId);
    res.status(200).json({ data: items });
  },

  async assign(req: Request, res: Response): Promise<void> {
    const companyId = requireRequestCompanyId(req);
    const operationId = String(req.params.operationId);
    const created = await operationChargeAssignmentService.assign(companyId, req.auth?.userId ?? null, {
      operationId,
      userId: req.body.userId as string,
      validFrom: req.body.validFrom as string,
      validUntil: (req.body.validUntil as string | null | undefined) ?? null,
    });
    res.status(201).json({ data: created });
  },

  async end(req: Request, res: Response): Promise<void> {
    const companyId = requireRequestCompanyId(req);
    const assignmentId = String(req.params.assignmentId);
    const updated = await operationChargeAssignmentService.endAssignment(
      companyId,
      req.auth?.userId ?? null,
      assignmentId,
      req.body.effectiveDate as string,
    );
    res.status(200).json({ data: updated });
  },

  async cancel(req: Request, res: Response): Promise<void> {
    const companyId = requireRequestCompanyId(req);
    const assignmentId = String(req.params.assignmentId);
    const updated = await operationChargeAssignmentService.cancelAssignment(
      companyId,
      req.auth?.userId ?? null,
      assignmentId,
    );
    res.status(200).json({ data: updated });
  },
};
